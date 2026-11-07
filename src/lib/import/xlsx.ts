import { DOMParser } from "@xmldom/xmldom";
import { unzipSync, strFromU8 } from "fflate";
import { ImportFailure } from "./types";

type XmlElement = {
  getElementsByTagName(name: string): ArrayLike<XmlElement>;
  getAttribute(name: string): string | null;
  textContent: string | null;
};

export type Sheet = {
  headers: string[];
  rows: { rowNumber: number; cells: string[] }[];
};

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];
const MAX_UNZIPPED_BYTES = 100 * 1024 * 1024;

const startsWith = (bytes: Uint8Array, magic: number[]) =>
  magic.every((b, i) => bytes[i] === b);

function columnIndex(cellRef: string): number {
  let n = 0;
  for (const ch of cellRef) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) break;
    n = n * 26 + code - 64;
  }
  return n - 1;
}

function parseXml(xml: string, part: string): XmlElement {
  try {
    const fail = (message: string) => {
      throw new Error(message);
    };
    const doc = new DOMParser({
      errorHandler: { warning: () => {}, error: fail, fatalError: fail },
    }).parseFromString(xml, "text/xml");
    return doc.documentElement as unknown as XmlElement;
  } catch (cause) {
    throw new ImportFailure(
      "corrupt_workbook",
      `This spreadsheet is damaged: ${part} could not be read.`,
      String(cause),
    );
  }
}

function sharedStrings(files: Record<string, Uint8Array>): string[] {
  const part = files["xl/sharedStrings.xml"];
  if (!part) return [];
  const root = parseXml(strFromU8(part), "shared strings");
  return Array.from(root.getElementsByTagName("si")).map((si) =>
    Array.from(si.getElementsByTagName("t"))
      .map((t) => t.textContent ?? "")
      .join(""),
  );
}

function firstWorksheetPath(files: Record<string, Uint8Array>): string | null {
  const sheets = Object.keys(files)
    .filter((f) => /^xl\/worksheets\/[^/]+\.xml$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return sheets[0] ?? null;
}

function cellValue(cell: XmlElement, shared: string[]): string {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") {
    return Array.from(cell.getElementsByTagName("t"))
      .map((t) => t.textContent ?? "")
      .join("");
  }
  const raw = cell.getElementsByTagName("v")[0]?.textContent ?? "";
  if (type === "s") return shared[Number(raw)] ?? "";
  return raw;
}

// Spectora's "HTML Text" export is an .xlsx zip named .xls, so the file is
// identified by its leading bytes, never by its extension.
export function readWorkbook(bytes: Uint8Array): Sheet {
  if (startsWith(bytes, OLE_MAGIC)) {
    throw new ImportFailure(
      "legacy_xls",
      "This is an older binary Excel file, not a Spectora export.",
      'Re-export from Spectora with "Export to spreadsheet" then "Export HTML Text". If the file was re-saved in Excel as 97-2003 format, save it as .xlsx instead.',
    );
  }
  if (!startsWith(bytes, ZIP_MAGIC)) {
    throw new ImportFailure(
      "not_a_spreadsheet",
      "This file is not a spreadsheet.",
      'Upload the file from Spectora\'s "Export to spreadsheet" then "Export HTML Text".',
    );
  }

  let files: Record<string, Uint8Array>;
  try {
    let total = 0;
    files = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_UNZIPPED_BYTES) throw new Error("archive too large");
        return f.name.startsWith("xl/");
      },
    });
  } catch (cause) {
    throw new ImportFailure(
      "corrupt_workbook",
      "This spreadsheet is damaged or truncated and could not be opened.",
      String(cause),
    );
  }

  const sheetPath = firstWorksheetPath(files);
  if (!sheetPath) {
    throw new ImportFailure(
      "not_a_spreadsheet",
      "This file is a zip archive, but it contains no worksheet.",
    );
  }

  const shared = sharedStrings(files);
  const root = parseXml(strFromU8(files[sheetPath]), "the worksheet");

  const parsed: { rowNumber: number; cells: string[] }[] = [];
  Array.from(root.getElementsByTagName("row")).forEach((row, index) => {
    const rowNumber = Number(row.getAttribute("r")) || index + 1;
    const cells: string[] = [];
    Array.from(row.getElementsByTagName("c")).forEach((cell, cellIndex) => {
      const ref = cell.getAttribute("r");
      const col = ref ? columnIndex(ref) : cellIndex;
      cells[col] = cellValue(cell, shared);
    });
    parsed.push({ rowNumber, cells: Array.from(cells, (c) => c ?? "") });
  });

  const [header, ...rows] = parsed;
  return { headers: header?.cells ?? [], rows };
}
