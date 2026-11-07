import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db/client";
import {
  addComment,
  copyTemplate,
  deleteComment,
  deleteTemplate,
  getImportReport,
  getSourceRows,
  getTemplateTree,
  renameItem,
  renameSection,
  revertComment,
  updateComment,
} from "@/lib/db/templates";
import { importSpectoraFile } from "@/lib/import/run";
import { ImportFailure } from "@/lib/import/types";
import { verifyStoredTemplate } from "@/lib/import/verify";
import { sampleBytes } from "./helpers";

let db: Db;
let templateId: string;
let runId: string;

const tree = async (id: string) => (await getTemplateTree(db, id))!;
const firstTextComment = (t: Awaited<ReturnType<typeof tree>>) =>
  t.sections.flatMap((s) => s.items.flatMap((i) => i.comments)).find((c) => c.textHtml)!;
const count = async (table: string) =>
  (await db.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n;

beforeAll(async () => {
  db = await createPgliteDb();
  ({ templateId, runId } = await importSpectoraFile(db, sampleBytes(), "InterNACHI Residential -2026-11-06.xls"));
});

describe("import", () => {
  it("stores a verified, structured template", async () => {
    const report = (await getImportReport(db, runId))!;
    expect(report.verification.ok).toBe(true);
    expect(report.verification.rowsChecked).toBe(392);
    expect(report.rows).toHaveLength(392);
    expect((await tree(templateId)).commentCount).toBe(392);
    expect(await count("sections")).toBe(13);
    expect(await count("items")).toBe(69);
  });

  it("detects a stored template that differs from its source", async () => {
    const t = await tree(templateId);
    const rows = await getSourceRows(db, runId);
    const report = (await getImportReport(db, runId))!;
    t.sections[1].items[1].comments[1].textHtml = "tampered";
    const result = verifyStoredTemplate(t, rows, report.headers);
    expect(result.ok).toBe(false);
    expect(result.mismatches[0].field).toBe("comment text");
  });

  it("detects a dropped comment", async () => {
    const t = await tree(templateId);
    const rows = await getSourceRows(db, runId);
    const report = (await getImportReport(db, runId))!;
    t.sections[1].items[1].comments.pop();
    expect(verifyStoredTemplate(t, rows, report.headers).ok).toBe(false);
  });

  it("rolls back everything if the stored data fails verification", async () => {
    const before = await Promise.all(["import_runs", "templates", "comments"].map(count));
    const attempt = importSpectoraFile(db, sampleBytes(), "bad.xls", {
      beforeVerify: async (q, id) => {
        await q.query(
          `update comments set text_html = 'corrupted' where id = (
             select c.id from comments c join items i on i.id = c.item_id
             join sections s on s.id = i.section_id
             where s.template_id = $1 and c.text_html is not null limit 1)`,
          [id],
        );
      },
    });
    await expect(attempt).rejects.toBeInstanceOf(ImportFailure);
    await expect(attempt).rejects.toMatchObject({ code: "verification_failed" });
    expect(await Promise.all(["import_runs", "templates", "comments"].map(count))).toEqual(before);
  });
});

describe("edits", () => {
  it("persists section, item and comment edits", async () => {
    const t = await tree(templateId);
    const section = t.sections[2];
    const item = section.items[0];
    const comment = firstTextComment(t);
    await renameSection(db, section.id, "Roof (edited)");
    await renameItem(db, item.id, "Item (edited)");
    await updateComment(db, comment.id, { textHtml: "<p>Edited text</p>", name: "Edited name" });

    const after = await tree(templateId);
    expect(after.sections[2].name).toBe("Roof (edited)");
    expect(after.sections[2].importedName).toBe("Roof");
    expect(after.sections[2].items[0].name).toBe("Item (edited)");
    const saved = firstTextComment(after);
    expect(saved.textHtml).toBe("<p>Edited text</p>");
    expect(saved.importedTextHtml).toBe(comment.importedTextHtml);
  });

  it("restores a comment to its imported text", async () => {
    const comment = firstTextComment(await tree(templateId));
    await revertComment(db, comment.id);
    const restored = firstTextComment(await tree(templateId));
    expect(restored.textHtml).toBe(comment.importedTextHtml);
    expect(restored.name).toBe(comment.importedName);
  });

  it("adds and removes a comment", async () => {
    const t = await tree(templateId);
    const item = t.sections[0].items[0];
    const id = await addComment(db, item.id, "defect");
    let items = (await tree(templateId)).sections[0].items[0].comments;
    expect(items.at(-1)?.id).toBe(id);
    await deleteComment(db, id);
    items = (await tree(templateId)).sections[0].items[0].comments;
    expect(items.find((c) => c.id === id)).toBeUndefined();
  });

  it("fails clearly when the row is gone", async () => {
    await expect(renameSection(db, "00000000-0000-0000-0000-000000000000", "x")).rejects.toThrow("no longer exists");
  });
});

describe("copies", () => {
  it("copies everything and stays independent in both directions", async () => {
    const original = await tree(templateId);
    const copyId = await copyTemplate(db, templateId);
    const copy = await tree(copyId);

    const shape = (t: typeof original) =>
      t.sections.map((s) => [s.name, s.items.map((i) => [i.name, i.comments.map((c) => [c.name, c.textHtml, c.commentType, c.choiceOptions, c.attributes])])]);
    expect(shape(copy)).toEqual(shape(original));
    expect(copy.name).toBe(`${original.name} (copy)`);
    expect(copy.copiedFromName).toBe(original.name);

    const ids = (t: typeof original) => t.sections.flatMap((s) => [s.id, ...s.items.flatMap((i) => [i.id, ...i.comments.map((c) => c.id)])]);
    const originalIds = new Set(ids(original));
    expect(ids(copy).some((id) => originalIds.has(id))).toBe(false);

    await renameSection(db, copy.sections[0].id, "Only in copy");
    await updateComment(db, firstTextComment(copy).id, { textHtml: "<p>Only in copy</p>" });
    expect(shape(await tree(templateId))).toEqual(shape(original));

    await renameSection(db, original.sections[0].id, "Only in original");
    expect((await tree(copyId)).sections[0].name).toBe("Only in copy");
    await renameSection(db, original.sections[0].id, original.sections[0].name);
  });

  it("survives deleting the original", async () => {
    const { templateId: id } = await importSpectoraFile(db, sampleBytes(), "second.xls");
    const copyId = await copyTemplate(db, id);
    await deleteTemplate(db, id);
    const copy = await tree(copyId);
    expect(copy.commentCount).toBe(392);
    expect(copy.copiedFromId).toBeNull();
  });

  it("refuses to copy a missing template", async () => {
    await expect(copyTemplate(db, "00000000-0000-0000-0000-000000000000")).rejects.toThrow("no longer exists");
  });
});
