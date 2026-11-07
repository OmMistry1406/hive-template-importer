import { readFileSync } from "node:fs";
import path from "node:path";
import { strToU8, zipSync } from "fflate";

export const SAMPLE_PATH = path.resolve("samples", "InterNACHI-Residential-2026-11-06.xls");
export const sampleBytes = () => new Uint8Array(readFileSync(SAMPLE_PATH));

export const HEADERS = [
  "Section Name",
  "Item Name",
  "Comment Name",
  "Comment Text",
  "Comment Type (info, limit, defect)",
  "Category (-1: Low, 0: Med, 1: High)",
  "Multiple Choice Options (comma-separated)",
  "Order (w/i item)",
  "Answer Type (boolean, checkbox, date, number, range, text)",
];

const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const column = (i: number) => String.fromCharCode(65 + i);

export function makeXlsx(
  headers: string[],
  rows: (string | undefined)[][],
  mode: "str" | "shared" | "inline" = "str",
): Uint8Array {
  const strings: string[] = [];
  const cell = (value: string | undefined, r: number, c: number) => {
    if (value === undefined) return "";
    const ref = `${column(c)}${r}`;
    if (mode === "shared") {
      strings.push(value);
      return `<c r="${ref}" t="s"><v>${strings.length - 1}</v></c>`;
    }
    if (mode === "inline") return `<c r="${ref}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
    return `<c r="${ref}" t="str"><v>${xml(value)}</v></c>`;
  };
  const rowXml = [headers, ...rows]
    .map((row, i) => `<row r="${i + 1}">${row.map((v, c) => cell(v, i + 1, c)).join("")}</row>`)
    .join("");
  const files: Record<string, Uint8Array> = {
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`,
    ),
  };
  if (mode === "shared") {
    files["xl/sharedStrings.xml"] = strToU8(
      `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings
        .map((s) => `<si><t>${xml(s)}</t></si>`)
        .join("")}</sst>`,
    );
  }
  return zipSync(files);
}
