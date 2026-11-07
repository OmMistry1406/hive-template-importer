import { describe, expect, it } from "vitest";
import { sanitizeForDisplay } from "@/lib/import/html";
import { parseSpectoraExport, templateNameFromFile } from "@/lib/import/parse";
import { ImportFailure } from "@/lib/import/types";
import { HEADERS, makeXlsx, sampleBytes } from "./helpers";

const parseSample = () => parseSpectoraExport(sampleBytes(), "InterNACHI Residential -2026-11-06.xls");
const failure = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ImportFailure) return e;
    throw e;
  }
  throw new Error("expected ImportFailure");
};
const row = (section?: string, item?: string, name?: string, text?: string, type = "defect") =>
  [section, item, name, text, type, "0", undefined, "0", "boolean"];

// Expected numbers come from a separate Python profile of the raw worksheet XML,
// not from this importer.
describe("committed InterNACHI export", () => {
  it("accounts for every row", () => {
    const { stats } = parseSample();
    expect(stats).toMatchObject({
      rows: 392, mapped: 392, quarantined: 0, blank: 0,
      sections: 13, items: 69, comments: 392, commentsWithText: 309, linkCount: 43,
    });
  });

  it("keeps section order and decodes escaped names", () => {
    const names = parseSample().sections.map((s) => s.name);
    expect(names[0]).toBe("Inspection Details");
    expect(names[3]).toBe("Basement, Foundation, Crawlspace & Structure");
    expect(names[12]).toBe("Garage");
    expect(names.join()).not.toContain("&amp;");
  });

  it("keeps comment HTML byte for byte, including CRLF and nbsp", () => {
    const comments = parseSample().sections.flatMap((s) => s.items.flatMap((i) => i.comments));
    expect(comments.find((c) => c.textHtml?.includes("\r\n"))).toBeTruthy();
    expect(comments.find((c) => c.name === "Evidence of Water Intrusion")?.textHtml).toBe(
      "<p>Siding showed signs of water intrusion. This could lead to further siding deterioration and/or mold. Recommend a qualified siding contractor evaluate and repair. </p>\r\n",
    );
  });

  it("keeps both comments that share a name", () => {
    const { sections, issues } = parseSample();
    const damper = sections.flatMap((s) => s.items.flatMap((i) => i.comments)).filter((c) => c.name === "Damper Inoperable");
    expect(damper).toHaveLength(2);
    expect(damper[0].textHtml).not.toBe(damper[1].textHtml);
    expect(issues.filter((i) => i.code === "duplicate_comment_name")).toHaveLength(1);
  });

  it("reports what the export is missing", () => {
    const { issues } = parseSample();
    const codes = (code: string) => issues.filter((i) => i.code === code);
    expect(codes("missing_comment_text")).toHaveLength(9);
    expect(codes("embed_missing_from_export")).toHaveLength(1);
    expect(codes("embed_missing_from_export")[0].origin).toBe("export_gap");
    expect(codes("order_ties")).toHaveLength(1);
    expect(codes("unknown_column")).toHaveLength(0);
  });

  it("flags stock cost estimates", () => {
    expect(parseSample().issues.find((i) => i.code === "stock_estimates")?.message).toContain("10-1000");
  });

  it("splits options without losing escaped text", () => {
    const all = parseSample().sections.flatMap((s) => s.items.flatMap((i) => i.comments)).flatMap((c) => c.choiceOptions);
    expect(all).toContain("Bradford & White");
  });

  it("derives the template name from the file name", () => {
    expect(templateNameFromFile("InterNACHI Residential -2026-11-06.xls")).toBe("InterNACHI Residential");
    expect(templateNameFromFile("My Template.xlsx")).toBe("My Template");
  });
});

describe("other exports in the same format", () => {
  it.each(["str", "shared", "inline"] as const)("reads %s cells", (mode) => {
    const bytes = makeXlsx(HEADERS, [row("A", "B", "C", "<p>x &amp; y</p>")], mode);
    const parsed = parseSpectoraExport(bytes, "t.xlsx");
    expect(parsed.sections[0].items[0].comments[0].textHtml).toBe("<p>x &amp; y</p>");
  });

  it("finds columns by name, not position", () => {
    const reversed = [...HEADERS].reverse();
    const bytes = makeXlsx(reversed, [[...row("A", "B", "C", "<p>t</p>")].reverse()]);
    const parsed = parseSpectoraExport(bytes, "t.xlsx");
    expect(parsed.sections[0].name).toBe("A");
    expect(parsed.sections[0].items[0].comments[0].name).toBe("C");
  });

  it("keeps unknown columns and flags them", () => {
    const bytes = makeXlsx([...HEADERS, "Brand New Column"], [[...row("A", "B", "C", "<p>t</p>"), "kept"]]);
    const parsed = parseSpectoraExport(bytes, "t.xlsx");
    expect(parsed.sections[0].items[0].comments[0].attributes["Brand New Column"]).toBe("kept");
    expect(parsed.issues.find((i) => i.code === "unknown_column")).toBeTruthy();
  });

  it("keeps a value that sits under no heading", () => {
    const parsed = parseSpectoraExport(makeXlsx(HEADERS, [[...row("A", "B", "C", "<p>t</p>"), "stray"]]), "t.xlsx");
    expect(Object.values(parsed.sections[0].items[0].comments[0].attributes)).toContain("stray");
  });

  it("quarantines a row with no section instead of dropping it", () => {
    const bytes = makeXlsx(HEADERS, [row("A", "B", "C", "<p>t</p>"), row(undefined, "B", "Orphan", "<p>keep me</p>")]);
    const parsed = parseSpectoraExport(bytes, "t.xlsx");
    expect(parsed.stats.quarantined).toBe(1);
    const q = parsed.sourceRows.find((r) => r.disposition === "quarantined");
    expect(q?.cells["Comment Text"]).toBe("<p>keep me</p>");
    expect(parsed.issues.find((i) => i.code === "row_without_parent")?.severity).toBe("error");
  });

  it("keeps file order when a section reappears", () => {
    const bytes = makeXlsx(HEADERS, [row("A", "I", "1", "<p>a</p>"), row("B", "I", "2", "<p>b</p>"), row("A", "I", "3", "<p>c</p>")]);
    const parsed = parseSpectoraExport(bytes, "t.xlsx");
    expect(parsed.sections.map((s) => s.name)).toEqual(["A", "B", "A"]);
    expect(parsed.issues.find((i) => i.code === "section_reappears")).toBeTruthy();
  });

  it("flags unsupported HTML and a likely plain-text export", () => {
    const withImage = parseSpectoraExport(makeXlsx(HEADERS, [row("A", "B", "C", '<p><video src="http://x/y.mp4"></video></p>')]), "t.xlsx");
    expect(withImage.issues.find((i) => i.code === "unsupported_html")?.detail).toBe("http://x/y.mp4");
    const plain = parseSpectoraExport(makeXlsx(HEADERS, [row("A", "B", "C", "plain words")]), "t.xlsx");
    expect(plain.issues.find((i) => i.code === "no_html_found")).toBeTruthy();
  });
});

describe("rich content from other exports", () => {
  it("keeps colour, images and tables on display, and turns video embeds into links", () => {
    const html = sanitizeForDisplay(
      '<p><span style="color:#ff0000">red</span></p><img src="https://x.example/a.png"><table><tr><td>t</td></tr></table><iframe src="https://www.youtube.com/embed/abc"></iframe>',
    );
    expect(html).toContain("color:#ff0000");
    expect(html).toContain('src="https://x.example/a.png"');
    expect(html).toContain("<td>t</td>");
    expect(html).toContain('href="https://www.youtube.com/embed/abc"');
    expect(html).not.toContain("<iframe");
  });

  it("flags photos, embeds and tables as limits", () => {
    const headers = [...HEADERS, "Default Photo 1"];
    const text = '<iframe src="https://v.example/1"></iframe><table><tr><td>a</td></tr></table>';
    const { issues } = parseSpectoraExport(makeXlsx(headers, [[...row("A", "B", "C", text), "https://p.example/1.jpg"]]), "t.xlsx");
    const codes = issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["photo_not_copied", "embed_shown_as_link", "table_not_editable"]));
  });

  it("blocks scriptable image sources", () => {
    expect(sanitizeForDisplay('<img src="javascript:alert(1)" onerror="x()">')).not.toMatch(/javascript|onerror/);
  });
});

describe("files that must be refused", () => {
  it("refuses a file that is not a spreadsheet", () => {
    expect(failure(() => parseSpectoraExport(new TextEncoder().encode("hello"), "t.xls")).code).toBe("not_a_spreadsheet");
  });
  it("refuses legacy binary xls", () => {
    expect(failure(() => parseSpectoraExport(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2]), "t.xls")).code).toBe("legacy_xls");
  });
  it("refuses a truncated workbook", () => {
    expect(failure(() => parseSpectoraExport(sampleBytes().slice(0, 4000), "t.xls")).code).toBe("corrupt_workbook");
  });
  it("refuses an unrelated spreadsheet", () => {
    expect(failure(() => parseSpectoraExport(makeXlsx(["Name", "Email"], [["a", "b"]]), "t.xlsx")).code).toBe("not_spectora_export");
  });
  it("names the missing columns", () => {
    const f = failure(() => parseSpectoraExport(makeXlsx(["Section Name", "Item Name", "Comment Name"], [["a", "b", "c"]]), "t.xlsx"));
    expect(f.code).toBe("missing_columns");
    expect(f.message).toContain("comment text");
  });
  it("refuses headers with no rows", () => {
    expect(failure(() => parseSpectoraExport(makeXlsx(HEADERS, []), "t.xlsx")).code).toBe("empty_export");
  });
});

describe("display sanitising", () => {
  it("removes scripts and unsafe links but keeps ordinary links", () => {
    const html = sanitizeForDisplay('<p onclick="x()">a<script>alert(1)</script> <a href="javascript:alert(1)">b</a> <a href="https://ok.example">c</a></p>');
    expect(html).not.toMatch(/script|onclick|javascript/);
    expect(html).toContain('href="https://ok.example"');
  });
});
