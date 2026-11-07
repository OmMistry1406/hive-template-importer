import { randomUUID } from "node:crypto";
import {
  ATTRIBUTE_COLUMNS,
  CORE_COLUMNS,
  REQUIRED_COLUMNS,
  normalizeHeader,
  type CoreColumn,
} from "./columns";
import { inspectCommentHtml } from "./html";
import {
  ImportFailure,
  type Disposition,
  type ImportStats,
  type Issue,
  type ParsedComment,
  type ParsedImport,
  type ParsedItem,
  type ParsedSection,
  type SourceRow,
} from "./types";
import { readWorkbook, type Sheet } from "./xlsx";

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };

// Section and item names arrive HTML-escaped ("Doors &amp; Windows"), so they
// get one strict decode: only complete entities ending in ";" are touched.
// Option lists are not escaped in the export ("Bradford & White") and are
// never decoded.
export const decodeName = (raw: string) =>
  raw.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });

// The export separates options with commas and has no escape for a comma
// inside an option, so that ambiguity is inherent to the format.
export const splitOptions = (raw: string) =>
  raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

export function templateNameFromFile(fileName: string): string {
  return (
    fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[\s_-]*\d{4}-\d{2}-\d{2}$/, "")
      .trim() || "Imported template"
  );
}

function resolveColumns(headers: string[]) {
  const core = new Map<CoreColumn, string>();
  const attributes: string[] = [];
  const unknown: string[] = [];
  const byNormal = new Map(
    Object.entries(CORE_COLUMNS).map(([key, name]) => [name, key as CoreColumn]),
  );

  for (const header of headers) {
    if (!header.trim()) continue;
    const normal = normalizeHeader(header);
    const key = byNormal.get(normal as never);
    if (key) core.set(key, header);
    else if (ATTRIBUTE_COLUMNS.has(normal)) attributes.push(header);
    else unknown.push(header);
  }
  return { core, attributes, unknown };
}

function assertSpectoraShape(headers: string[], core: Map<CoreColumn, string>) {
  const missing = REQUIRED_COLUMNS.filter((c) => !core.has(c)).map(
    (c) => CORE_COLUMNS[c],
  );
  if (missing.length === REQUIRED_COLUMNS.length) {
    throw new ImportFailure(
      "not_spectora_export",
      "This spreadsheet does not look like a Spectora template export.",
      `No Spectora columns were found. First row was: ${headers.filter(Boolean).slice(0, 6).join(", ") || "(empty)"}`,
    );
  }
  if (missing.length > 0) {
    throw new ImportFailure(
      "missing_columns",
      `This export is missing required column(s): ${missing.join(", ")}.`,
      "Nothing was imported. Re-export the template from Spectora without changing its columns.",
    );
  }
}

export function parseSpectoraSheet(sheet: Sheet, fileName: string): ParsedImport {
  const counts = new Map<string, number>();
  const headers = sheet.headers.map((header) => {
    const seen = (counts.get(header) ?? 0) + 1;
    counts.set(header, seen);
    return header.trim() && seen > 1 ? `${header} [${seen}]` : header;
  });
  const { core, attributes, unknown } = resolveColumns(headers);
  assertSpectoraShape(headers, core);

  if (sheet.rows.length === 0) {
    throw new ImportFailure(
      "empty_export",
      "This export has column headings but no template rows.",
    );
  }

  const issues: Issue[] = [];
  const sourceRows: SourceRow[] = [];
  const sections: ParsedSection[] = [];
  const seenSections = new Set<string>();
  const seenNames = new Map<string, number>();
  const issueRow = (rowNumber: number | null, issue: Omit<Issue, "rowNumber">) =>
    issues.push({ rowNumber, ...issue });

  for (const header of unknown) {
    issueRow(null, {
      severity: "warning",
      origin: "importer_limit",
      code: "unknown_column",
      message: `Column "${header}" is not recognised. Its values are kept with each comment, but nothing in the app uses them.`,
    });
  }

  let section: ParsedSection | null = null;
  let item: ParsedItem | null = null;
  let seenItems = new Set<string>();
  let lastOrder: number | null = null;
  let itemsWithOrderTies = 0;
  let itemHasTie = false;
  let linkCount = 0;
  let htmlComments = 0;
  let sawHtml = false;

  for (const row of sheet.rows) {
    const cells: Record<string, string> = {};
    row.cells.forEach((value, i) => {
      if (value) cells[headers[i]?.trim() ? headers[i] : `(unnamed column ${i + 1})`] = value;
    });
    const get = (key: CoreColumn) => cells[core.get(key) ?? ""] ?? "";
    const rowNumber = row.rowNumber;

    const sectionName = get("section");
    const itemName = get("item");
    const commentName = get("commentName");
    const commentText = get("commentText");

    const rowId = randomUUID();
    const record = (d: Disposition) =>
      sourceRows.push({ id: rowId, rowNumber, cells, disposition: d });

    if (Object.values(cells).every((v) => !v.trim())) {
      record("blank");
      continue;
    }

    if (!sectionName.trim() || !itemName.trim()) {
      issueRow(rowNumber, {
        severity: "error",
        origin: "source_data",
        code: "row_without_parent",
        message: `This row has no ${!sectionName.trim() ? "section" : "item"} name, so it has no place in the template. It was not imported into the template; its contents are preserved here.`,
        detail: commentName || commentText.slice(0, 120) || undefined,
      });
      record("quarantined");
      continue;
    }

    // A new section starts only where the name changes, so flattening the tree
    // always gives back file order. The export has no section ID: two adjacent
    // sections with the same name cannot be told apart.
    if (!section || section.name !== decodeName(sectionName)) {
      section = { id: randomUUID(), name: decodeName(sectionName), items: [] };
      sections.push(section);
      item = null;
      seenItems = new Set();
      if (seenSections.has(section.name)) {
        issueRow(rowNumber, {
          severity: "warning",
          origin: "source_data",
          code: "section_reappears",
          message: `Section "${section.name}" appears again after another section. It was kept as a separate section, to match the file's order.`,
        });
      }
      seenSections.add(section.name);
    }

    if (!item || item.name !== decodeName(itemName)) {
      if (itemHasTie) itemsWithOrderTies++;
      itemHasTie = false;
      lastOrder = null;
      item = { id: randomUUID(), name: decodeName(itemName), comments: [] };
      section.items.push(item);
      if (seenItems.has(item.name)) {
        issueRow(rowNumber, {
          severity: "warning",
          origin: "source_data",
          code: "item_reappears",
          message: `Item "${item.name}" appears twice in section "${section.name}" with other items in between. It was kept as a separate item, to match the file's order.`,
        });
      }
      seenItems.add(item.name);
    }

    if (!commentName.trim() && !commentText.trim()) {
      issueRow(rowNumber, {
        severity: "info",
        origin: "source_data",
        code: "item_without_comment",
        message: `Item "${item.name}" is listed with no comment on this row.`,
      });
      record("structure_only");
      continue;
    }

    if (!commentName.trim()) {
      issueRow(rowNumber, {
        severity: "warning",
        origin: "source_data",
        code: "missing_comment_name",
        message: "This comment has text but no name.",
      });
    }

    const commentType = get("commentType") || null;
    if (commentType && !["info", "limit", "defect"].includes(commentType)) {
      issueRow(rowNumber, {
        severity: "warning",
        origin: "source_data",
        code: "unknown_comment_type",
        message: `Comment type "${commentType}" is not info, limit or defect. It was kept as written.`,
      });
    }
    if (!commentText.trim() && (commentType === "defect" || commentType === "limit")) {
      issueRow(rowNumber, {
        severity: "warning",
        origin: "export_gap",
        code: "missing_comment_text",
        message: `"${decodeName(commentName)}" is a ${commentType} comment with no text in the export. It was imported with an empty comment.`,
      });
    }

    const orderHeader = headers.find((h) => normalizeHeader(h) === "order");
    const order = orderHeader ? Number(cells[orderHeader]) : NaN;
    if (Number.isFinite(order)) {
      if (lastOrder !== null && order === lastOrder) itemHasTie = true;
      if (lastOrder !== null && order < lastOrder) {
        issueRow(rowNumber, {
          severity: "warning",
          origin: "source_data",
          code: "order_conflicts_with_file",
          message: `Spectora's Order value (${order}) comes after a higher value. File order was kept.`,
        });
      }
      lastOrder = order;
    }

    const duplicateKey = `${section.name}\u0000${item.name}\u0000${decodeName(commentName).trim()}`;
    const firstRow = seenNames.get(duplicateKey);
    if (firstRow !== undefined) {
      issueRow(rowNumber, {
        severity: "info",
        origin: "source_data",
        code: "duplicate_comment_name",
        message: `Same comment name as row ${firstRow}. Both were kept.`,
      });
    } else {
      seenNames.set(duplicateKey, rowNumber);
    }

    if (commentText) {
      const findings = inspectCommentHtml(commentText);
      linkCount += findings.linkCount;
      if (findings.isHtml) {
        htmlComments++;
        sawHtml = true;
      }
      for (const finding of findings.issues) issueRow(rowNumber, finding);
    }

    for (const [header, value] of Object.entries(cells)) {
      if (/^default photo \d+$/.test(normalizeHeader(header))) {
        issueRow(rowNumber, {
          severity: "warning",
          origin: "importer_limit",
          code: "photo_not_copied",
          message: "This comment has a default photo. Its address is kept, but the image file is not copied, so it depends on Spectora keeping it online.",
          detail: value,
        });
      }
    }

    const attributeValues: Record<string, string> = {};
    for (const header of [...attributes, ...unknown]) {
      if (cells[header]) attributeValues[header] = cells[header];
    }
    for (const [key, value] of Object.entries(cells)) {
      if (key.startsWith("(unnamed column")) attributeValues[key] = value;
    }

    const comment: ParsedComment = {
      id: randomUUID(),
      sourceRowId: rowId,
      name: decodeName(commentName),
      textHtml: commentText || null,
      commentType,
      category: get("category") || null,
      recommendation: get("recommendation") || null,
      answerType: get("answerType") || null,
      choiceOptions: splitOptions(get("choiceOptions")),
      unitOptions: splitOptions(get("unitOptions")),
      attributes: attributeValues,
    };
    item.comments.push(comment);
    record("mapped");
  }
  if (itemHasTie) itemsWithOrderTies++;

  if (itemsWithOrderTies > 0) {
    issueRow(null, {
      severity: "info",
      origin: "export_gap",
      code: "order_ties",
      message: `${itemsWithOrderTies} item(s) repeat the same Order value, so Order alone cannot rank their comments. The order of rows in the file was used.`,
    });
  }

  const commentTextHeader = core.get("commentText")!;
  if (!sawHtml && sourceRows.some((r) => r.cells[commentTextHeader])) {
    issueRow(null, {
      severity: "warning",
      origin: "export_gap",
      code: "no_html_found",
      message:
        'No comment contains formatting or links. This may be the plain-text export; use "Export HTML Text" so links and formatting come across.',
    });
  }

  const estimateHeaders = ["default estimate min", "default estimate max"].map((name) =>
    headers.find((h) => normalizeHeader(h) === name),
  );
  const estimatePairs = new Set(
    sourceRows
      .filter((r) => r.disposition === "mapped")
      .map((r) => estimateHeaders.map((h) => r.cells[h ?? ""] ?? "").join("-")),
  );
  if (sourceRows.length > 1 && estimatePairs.size === 1 && ![...estimatePairs][0].startsWith("-")) {
    issueRow(null, {
      severity: "info",
      origin: "source_data",
      code: "stock_estimates",
      message: `Every comment has the same cost estimate (${[...estimatePairs][0]}). This looks like a Spectora default, not your pricing. It is stored but not used here.`,
    });
  }

  const mappedCount = sourceRows.filter((r) => r.disposition === "mapped").length;
  if (mappedCount === 0) {
    throw new ImportFailure(
      "no_usable_rows",
      "No row in this file could be placed in a template.",
      `${sourceRows.length} row(s) read. Each needs a section name and an item name.`,
    );
  }

  const comments = sections.flatMap((s) => s.items.flatMap((i) => i.comments));
  const count = (d: Disposition) => sourceRows.filter((r) => r.disposition === d).length;
  const stats: ImportStats = {
    rows: sourceRows.length,
    mapped: mappedCount,
    structureOnly: count("structure_only"),
    quarantined: count("quarantined"),
    blank: count("blank"),
    sections: sections.length,
    items: sections.reduce((n, s) => n + s.items.length, 0),
    comments: comments.length,
    commentsWithText: comments.filter((c) => c.textHtml).length,
    linkCount,
    htmlComments,
  };

  return {
    templateName: templateNameFromFile(fileName),
    headers,
    sections,
    sourceRows,
    issues,
    stats,
  };
}

export function parseSpectoraExport(bytes: Uint8Array, fileName: string): ParsedImport {
  return parseSpectoraSheet(readWorkbook(bytes), fileName);
}
