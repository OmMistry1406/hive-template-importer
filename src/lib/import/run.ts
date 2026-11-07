import { createHash, randomUUID } from "node:crypto";
import type { Db, Queryable } from "@/lib/db/client";
import { getSourceRows, getTemplateTree } from "@/lib/db/templates";
import { parseSpectoraExport } from "./parse";
import { ImportFailure, type ParsedImport } from "./types";
import { verifyStoredTemplate } from "./verify";

const bulk = (rows: unknown[]) => JSON.stringify(rows);

async function writeTree(q: Queryable, parsed: ParsedImport, runId: string, templateId: string) {
  await q.query(
    `insert into templates (id, name, import_run_id) values ($1, $2, $3)`,
    [templateId, parsed.templateName, runId],
  );

  await q.query(
    `insert into import_source_rows (id, import_run_id, row_number, cells, disposition)
     select id, $2, row_number, cells, disposition
     from jsonb_to_recordset($1::text::jsonb)
       as x(id uuid, row_number int, cells jsonb, disposition text)`,
    [
      bulk(parsed.sourceRows.map((r) => ({
        id: r.id,
        row_number: r.rowNumber,
        cells: r.cells,
        disposition: r.disposition,
      }))),
      runId,
    ],
  );

  if (parsed.issues.length > 0) {
    await q.query(
      `insert into import_issues (import_run_id, row_number, severity, origin, code, message, detail)
       select $2, row_number, severity, origin, code, message, detail
       from jsonb_to_recordset($1::text::jsonb)
         as x(row_number int, severity text, origin text, code text, message text, detail text)`,
      [
        bulk(parsed.issues.map((i) => ({
          row_number: i.rowNumber,
          severity: i.severity,
          origin: i.origin,
          code: i.code,
          message: i.message,
          detail: i.detail ?? null,
        }))),
        runId,
      ],
    );
  }

  await q.query(
    `insert into sections (id, template_id, position, name, imported_name)
     select id, $2, position, name, name
     from jsonb_to_recordset($1::text::jsonb) as x(id uuid, position int, name text)`,
    [bulk(parsed.sections.map((s, position) => ({ id: s.id, position, name: s.name }))), templateId],
  );

  await q.query(
    `insert into items (id, section_id, position, name, imported_name)
     select id, section_id, position, name, name
     from jsonb_to_recordset($1::text::jsonb)
       as x(id uuid, section_id uuid, position int, name text)`,
    [
      bulk(parsed.sections.flatMap((s) =>
        s.items.map((i, position) => ({ id: i.id, section_id: s.id, position, name: i.name })),
      )),
    ],
  );

  await q.query(
    `insert into comments (id, item_id, position, name, text_html, comment_type, category,
       recommendation, answer_type, choice_options, unit_options, attributes, source_row_id,
       imported_name, imported_text_html)
     select id, item_id, position, name, text_html, comment_type, category, recommendation,
            answer_type, choice_options, unit_options, attributes, source_row_id, name, text_html
     from jsonb_to_recordset($1::text::jsonb) as x(
       id uuid, item_id uuid, position int, name text, text_html text, comment_type text,
       category text, recommendation text, answer_type text, choice_options jsonb,
       unit_options jsonb, attributes jsonb, source_row_id uuid)`,
    [
      bulk(parsed.sections.flatMap((s) =>
        s.items.flatMap((i) =>
          i.comments.map((c, position) => ({
            id: c.id,
            item_id: i.id,
            position,
            name: c.name,
            text_html: c.textHtml,
            comment_type: c.commentType,
            category: c.category,
            recommendation: c.recommendation,
            answer_type: c.answerType,
            choice_options: c.choiceOptions,
            unit_options: c.unitOptions,
            attributes: c.attributes,
            source_row_id: c.sourceRowId,
          })),
        ),
      )),
    ],
  );
}

export type ImportResult = {
  templateId: string;
  runId: string;
};

export type ImportHooks = {
  // Test seam: lets a test corrupt stored data before verification runs.
  beforeVerify?: (q: Queryable, templateId: string) => Promise<void>;
};

// Write, read back and verify all happen in one transaction: if the stored
// template does not match the source rows, nothing is kept.
export async function importSpectoraFile(
  db: Db,
  bytes: Uint8Array,
  fileName: string,
  hooks: ImportHooks = {},
): Promise<ImportResult> {
  const parsed = parseSpectoraExport(bytes, fileName);
  const runId = randomUUID();
  const templateId = randomUUID();
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  await db.tx(async (q) => {
    await q.query(
      `insert into import_runs (id, file_name, file_sha256, file_bytes, headers, row_count, stats, verification)
       values ($1, $2, $3, $4, $5::text::jsonb, $6, $7::text::jsonb, '{}'::jsonb)`,
      [runId, fileName, sha256, bytes.length, JSON.stringify(parsed.headers), parsed.sourceRows.length, JSON.stringify(parsed.stats)],
    );
    await writeTree(q, parsed, runId, templateId);
    await hooks.beforeVerify?.(q, templateId);

    const stored = await getTemplateTree(q, templateId);
    const sourceRows = await getSourceRows(q, runId);
    const verification = verifyStoredTemplate(stored!, sourceRows, parsed.headers);
    if (!verification.ok) {
      const first = verification.mismatches[0];
      throw new ImportFailure(
        "verification_failed",
        "The saved template did not match your file, so the import was cancelled and nothing was saved.",
        first
          ? `Row ${first.rowNumber}, ${first.field}: expected "${first.expected.slice(0, 80)}" but stored "${first.actual.slice(0, 80)}"`
          : `Rows not found in the saved template: ${verification.rowsUnaccounted.slice(0, 10).join(", ")}`,
      );
    }
    await q.query("update import_runs set verification = $2::text::jsonb where id = $1", [
      runId,
      JSON.stringify(verification),
    ]);
  });

  return { templateId, runId };
}
