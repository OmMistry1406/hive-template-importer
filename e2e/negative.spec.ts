import { expect, test } from "@playwright/test";
import { HEADERS, makeXlsx, sampleBytes } from "../tests/helpers";
import { upload, uploadAlert } from "./helpers";

const file = (name: string, buffer: Uint8Array) => ({
  name,
  mimeType: "application/vnd.ms-excel",
  buffer: Buffer.from(buffer),
});

const templateCount = async (page: import("@playwright/test").Page) => {
  await page.goto("/templates");
  return page.locator("main li").count();
};

test("refused files leave no trace", async ({ page }) => {
  const before = await templateCount(page);
  const cases: [string, Uint8Array, string][] = [
    ["notes.xls", new TextEncoder().encode("this is not a spreadsheet"), "This file is not a spreadsheet."],
    ["old.xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), "older binary Excel file"],
    ["cut.xls", sampleBytes().slice(0, 5000), "damaged or truncated"],
    ["contacts.xlsx", makeXlsx(["Name", "Email"], [["Ann", "a@b.c"]]), "does not look like a Spectora template export"],
    ["partial.xlsx", makeXlsx(["Section Name", "Item Name", "Comment Name"], [["A", "B", "C"]]), "missing required column"],
    ["empty.xlsx", makeXlsx(HEADERS, []), "no template rows"],
  ];
  for (const [name, bytes, message] of cases) {
    await upload(page, file(name, bytes));
    await expect(uploadAlert(page, message)).toBeVisible();
    await expect(uploadAlert(page, message)).toContainText("Nothing was added");
  }
  expect(await templateCount(page)).toBe(before);
});

test("uploaded HTML cannot run scripts", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  const evil = '<p>Safe text</p><script>alert("xss")</script><img src="x" onerror="alert(1)"><a href="javascript:alert(2)">bad link</a><p onclick="alert(3)">click</p>';
  const bytes = makeXlsx(HEADERS, [["Security <b>Check</b>", "Item", "Hostile comment", evil, "defect", "0", undefined, "0", "boolean"]]);
  await upload(page, file("hostile.xlsx", bytes));
  await expect(page.getByText("1 of 1 rows accounted for")).toBeVisible({ timeout: 30000 });

  await page.getByRole("link", { name: /Back to hostile/ }).click();
  await expect(page.getByText("Safe text")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Section name" })).toHaveValue("Security <b>Check</b>");
  await page.getByText("click", { exact: true }).click();
  await page.getByRole("button", { name: "Done" }).click();
  expect(await page.locator("main script").count()).toBe(0);
  expect(await page.locator('a[href^="javascript"]').count()).toBe(0);
  expect(dialogs).toEqual([]);
});

test("a row with no section is kept visible, not dropped", async ({ page }) => {
  const bytes = makeXlsx(HEADERS, [
    ["Roof", "Coverings", "Worn", "<p>Shingles worn.</p>", "defect", "0", undefined, "0", "boolean"],
    [undefined, "Coverings", "Orphan comment", "<p>Text that must not vanish.</p>", "defect", "0", undefined, "1", "boolean"],
  ]);
  await upload(page, file("orphan.xlsx", bytes));
  await expect(page.getByText("2 of 2 rows accounted for, 1 could not be placed")).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/This row has no section name/)).toBeVisible();
  await page.getByRole("button", { name: /^Not placed/ }).click();
  await expect(page.getByRole("row").filter({ hasText: "Orphan comment" })).toBeVisible();
});

test("names cannot be saved empty", async ({ page }) => {
  await page.goto("/");
  const section = page.getByRole("textbox", { name: "Section name" });
  const original = await section.inputValue();
  await section.fill("   ");
  await section.blur();
  await expect(page.getByRole("alert").filter({ hasText: "Section name cannot be empty." })).toBeVisible();
  await section.press("Escape");
  await expect(section).toHaveValue(original);
  await page.reload();
  await expect(section).toHaveValue(original);
});

test("an unknown template shows not found", async ({ page }) => {
  const response = await page.goto("/templates/00000000-0000-0000-0000-000000000000");
  expect(response?.status()).toBe(404);
  const bad = await page.goto("/templates/not-a-uuid/report");
  expect(bad?.status()).toBe(404);
});

test("deleting a copy leaves the original intact", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Make a copy" }).click();
  await expect(page.getByText("Changes here do not affect it.")).toBeVisible();
  const copyName = await page.getByRole("textbox", { name: "Template name" }).inputValue();
  await page.getByRole("button", { name: `Delete ${copyName}` }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.getByRole("link", { name: copyName, exact: true })).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("button")).toHaveCount(13);
});
