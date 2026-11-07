import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const SAMPLE = path.resolve("samples", "InterNACHI-Residential-2026-11-06.xls");

async function importSample(page: Page) {
  await page.goto("/import");
  await page.getByLabel("Spectora export file").setInputFiles(SAMPLE);
  await expect(page.getByText("392 of 392 rows accounted for")).toBeVisible({ timeout: 30000 });
}

const openTemplateFromReport = (page: Page) =>
  page.getByRole("link", { name: /Back to InterNACHI/ }).click();

const saved = (page: Page) => expect(page.getByText("All changes saved")).toBeVisible();

test.describe.configure({ mode: "serial" });

test("import shows a report and opens on the template", async ({ page }) => {
  await importSample(page);
  await expect(page.getByText("Not in Spectora's file")).toBeVisible();
  await expect(page.getByRole("button", { name: "All (392)" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Section name" })).toHaveValue("Inspection Details");
  await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("button")).toHaveCount(13);
});

test("edits survive a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Exterior/ }).click();
  const section = page.getByRole("textbox", { name: "Section name" });
  await section.fill("Exterior (reviewed)");
  await section.blur();
  await saved(page);

  await page.getByRole("button", { name: "Edit text of Cracking - Minor" }).click();
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Added by the inspector.");
  await page.getByRole("button", { name: "Done" }).click();
  await saved(page);

  await page.reload();
  await page.getByRole("button", { name: /^Exterior \(reviewed\)/ }).click();
  await expect(section).toHaveValue("Exterior (reviewed)");
  await expect(page.getByText("Added by the inspector.")).toBeVisible();
  await expect(page.getByText("Edited").first()).toBeVisible();
});

test("opening a comment without changing it leaves it unedited", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Roof/ }).click();
  const before = await page.getByText("Edited", { exact: true }).count();
  await page.getByRole("button", { name: /^Edit text of/ }).nth(3).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Edited", { exact: true })).toHaveCount(before);
  await expect(page.getByText("Changes save automatically")).toBeVisible();
});

test("a copy changes independently of the original", async ({ page }) => {
  await page.goto("/");
  const originalUrl = page.url();
  await page.getByRole("button", { name: "Make a copy" }).click();
  await expect(page.getByText("Changes here do not affect it.")).toBeVisible();

  const section = page.getByRole("textbox", { name: "Section name" });
  await section.fill("Changed only in the copy");
  await section.blur();
  await saved(page);

  await page.goto(originalUrl);
  await expect(section).toHaveValue("Inspection Details");
});

test("the report tracks edits", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Import report" }).click();
  await expect(page.getByRole("button", { name: "Changed (1)" })).toBeVisible();
  await openTemplateFromReport(page);
  await expect(page.getByRole("button", { name: "Make a copy" })).toBeVisible();
});

test("a wrong file is refused with a reason", async ({ page }) => {
  await page.goto("/import");
  await page.getByLabel("Spectora export file").setInputFiles({
    name: "notes.xls",
    mimeType: "text/plain",
    buffer: Buffer.from("this is not a spreadsheet"),
  });
  const alert = page.getByRole("alert").filter({ hasText: "This file is not a spreadsheet." });
  await expect(alert).toContainText("Nothing was added");
  await page.goto("/templates");
  await expect(page.getByRole("listitem")).toHaveCount(2);
});
