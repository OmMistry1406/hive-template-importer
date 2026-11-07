import { CORE_COLUMNS, normalizeHeader, type CoreColumn } from "./columns";
import { decodeName, splitOptions } from "./parse";
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

// Compares what the database now holds with the untouched source rows. It
// must not reuse parser state, or a parser bug would agree with itself.
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

  const flat = template.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.comments.map((comment) => ({ section, item, comment })),
    ),
  );
  const expectedRows = sourceRows
    .filter((r) => r.disposition === "mapped")
    .sort((a, b) => a.rowNumber - b.rowNumber);

  if (flat.length !== expectedRows.length) {
    result.mismatches.push({
      rowNumber: 0,
      field: "comment count",
      expected: String(expectedRows.length),
      actual: String(flat.length),
    });
  }

  expectedRows.forEach((row, index) => {
    const stored = flat[index];
    if (!stored || stored.comment.sourceRowId !== row.id) {
      result.rowsUnaccounted.push(row.rowNumber);
      return;
    }
    result.rowsChecked++;
    const { section, item, comment } = stored;
    const n = row.rowNumber;
    check(n, "section", decodeName(cell(row, "section")), section.name);
    check(n, "item", decodeName(cell(row, "item")), item.name);
    check(n, "comment name", decodeName(cell(row, "commentName")), comment.name);
    check(n, "comment text", cell(row, "commentText"), comment.textHtml ?? "");
    check(n, "comment type", cell(row, "commentType"), comment.commentType ?? "");
    check(n, "category", cell(row, "category"), comment.category ?? "");
    check(n, "recommendation", cell(row, "recommendation"), comment.recommendation ?? "");
    check(n, "answer type", cell(row, "answerType"), comment.answerType ?? "");
    check(
      n,
      "multiple choice options",
      JSON.stringify(splitOptions(cell(row, "choiceOptions"))),
      JSON.stringify(comment.choiceOptions),
    );
    check(
      n,
      "unit options",
      JSON.stringify(splitOptions(cell(row, "unitOptions"))),
      JSON.stringify(comment.unitOptions),
    );

    const coreHeaders = new Set(
      (Object.keys(CORE_COLUMNS) as CoreColumn[]).map(headerFor),
    );
    for (const [header, value] of Object.entries(row.cells)) {
      if (coreHeaders.has(header)) continue;
      check(n, header, value, comment.attributes[header] ?? "");
    }
  });

  result.ok = result.mismatches.length === 0 && result.rowsUnaccounted.length === 0;
  return result;
}
