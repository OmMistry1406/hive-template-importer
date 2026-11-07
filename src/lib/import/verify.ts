import he from "he";
import { CORE_COLUMNS, normalizeHeader, type CoreColumn } from "./columns";
import type { Disposition, Verification } from "./types";

export type StoredComment = {
  name: string;
  textHtml: string | null;
  commentType: string | null;
  category: string | null;
  recommendation: string | null;
  answerType: string | null;
  choiceOptions: string[];
  unitOptions: string[];
  attributes: Record<string, string>;
  sourceRowId: string | null;
};

export type StoredTemplate = {
  sections: {
    name: string;
    items: { name: string; comments: StoredComment[] }[];
  }[];
};

export type StoredSourceRow = {
  id: string;
  rowNumber: number;
  cells: Record<string, string>;
  disposition: Disposition;
};

// A second, independent decoder (the parser has its own), so a decoding bug
// in one is caught by the other instead of agreeing with itself.
const decode = (raw: string) => {
  try {
    return he.decode(raw, { strict: true });
  } catch {
    return `\u0000undecodable:${raw}`;
  }
};

// Option text must survive splitting: same characters, separators aside.
const optionContent = (text: string) => text.replace(/[\s,]/g, "");

// Compares what the database now holds with the untouched source rows. It
// does not reuse parser state, or a parser bug would agree with itself.
export function verifyStoredTemplate(
  template: StoredTemplate,
  sourceRows: StoredSourceRow[],
  headers: string[],
): Verification {
  const headerFor = (key: CoreColumn) =>
    headers.find((h) => normalizeHeader(h) === CORE_COLUMNS[key]) ?? "";
  const cell = (row: StoredSourceRow, key: CoreColumn) => row.cells[headerFor(key)] ?? "";

  const result: Verification = {
    ok: true,
    rowsChecked: 0,
    fieldsChecked: 0,
    mismatches: [],
    rowsUnaccounted: [],
  };
  const check = (rowNumber: number, field: string, expected: string, actual: string) => {
    result.fieldsChecked++;
    if (expected !== actual) result.mismatches.push({ rowNumber, field, expected, actual });
  };

  // Structure: walking the rows in file order, a new item starts exactly where
  // the section or item name changes, and every row lands in that item.
  const slots = template.sections.flatMap((section) => section.items.map((item) => ({ section, item })));
  const placed = sourceRows
    .filter((r) => r.disposition === "mapped" || r.disposition === "structure_only")
    .sort((a, b) => a.rowNumber - b.rowNumber);
  let index = -1;
  let previousKey: string | null = null;
  let previousSection: string | null = null;
  let sectionChanges = 0;
  for (const row of placed) {
    const sectionRaw = cell(row, "section");
    const key = `${sectionRaw}\u0000${cell(row, "item")}`;
    if (key !== previousKey) index++;
    if (sectionRaw !== previousSection) sectionChanges++;
    previousKey = key;
    previousSection = sectionRaw;
    const slot = slots[index];
    if (!slot) {
      result.rowsUnaccounted.push(row.rowNumber);
      continue;
    }
    check(row.rowNumber, "section", decode(sectionRaw), slot.section.name);
    check(row.rowNumber, "item", decode(cell(row, "item")), slot.item.name);
    if (row.disposition === "mapped" && !slot.item.comments.some((c) => c.sourceRowId === row.id)) {
      result.mismatches.push({ rowNumber: row.rowNumber, field: "grouping", expected: "comment in this item", actual: "comment elsewhere" });
    }
  }
  check(0, "item count", String(index + 1), String(slots.length));
  check(0, "section count", String(sectionChanges), String(template.sections.length));

  // Content: every mapped row, in file order, against the stored comment.
  const flat = template.sections.flatMap((section) => section.items.flatMap((item) => item.comments));
  const expectedRows = placed.filter((r) => r.disposition === "mapped");
  check(0, "comment count", String(expectedRows.length), String(flat.length));

  const coreHeaders = new Set((Object.keys(CORE_COLUMNS) as CoreColumn[]).map(headerFor));
  expectedRows.forEach((row, i) => {
    const comment = flat[i];
    if (!comment || comment.sourceRowId !== row.id) {
      result.rowsUnaccounted.push(row.rowNumber);
      return;
    }
    result.rowsChecked++;
    const n = row.rowNumber;
    check(n, "comment name", decode(cell(row, "commentName")), comment.name);
    check(n, "comment text", cell(row, "commentText"), comment.textHtml ?? "");
    check(n, "comment type", cell(row, "commentType"), comment.commentType ?? "");
    check(n, "category", cell(row, "category"), comment.category ?? "");
    check(n, "recommendation", cell(row, "recommendation"), comment.recommendation ?? "");
    check(n, "answer type", cell(row, "answerType"), comment.answerType ?? "");
    check(n, "multiple choice options", optionContent(cell(row, "choiceOptions")), optionContent(comment.choiceOptions.join("")));
    check(n, "unit options", optionContent(cell(row, "unitOptions")), optionContent(comment.unitOptions.join("")));
    for (const [header, value] of Object.entries(row.cells)) {
      if (coreHeaders.has(header)) continue;
      check(n, header, value, comment.attributes[header] ?? "");
    }
  });

  result.ok = result.mismatches.length === 0 && result.rowsUnaccounted.length === 0;
  return result;
}
