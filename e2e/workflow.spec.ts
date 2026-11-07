import { expect, test } from "@playwright/test";
import { saved } from "./helpers";

test.describe.configure({ mode: "serial" });

test("opens on the imported template with every section", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Template name" })).toHaveValue("InterNACHI-Residential");
  await expect(page.getByRole("textbox", { name: "Section name" })).toHaveValue("Inspection Details");
  await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("button")).toHaveCount(13);
  await expect(page.getByRole("complementary", { name: "Getting started" })).toBeVisible();
});

test("keeps formatting and links from the export", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Exterior/ }).click();
  const link = page.getByRole("link", { name: "Here is a DIY troubleshooting article" }).first();
  await expect(link).toHaveAttribute("href", "http://www.familyhandyman.com/doors/repair/fix-sagging-or-sticking-doors/view-all");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

test("edits to names and comment text survive a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Exterior/ }).click();
  const section = page.getByRole("textbox", { name: "Section name" });
  await section.fill("Exterior (reviewed)");
  await section.blur();
  await saved(page);

  const item = page.getByRole("textbox", { name: "Item name" }).nth(1);
  await item.fill("Siding & Trim");
  await item.press("Enter");
  await saved(page);

  await page.getByRole("button", { name: "Edit text of Cracking - Minor" }).click();
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Added by the inspector.");
  await page.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.type(" Important.");
  await page.getByRole("button", { name: "Done" }).click();
  await saved(page);

  await page.reload();
  await page.getByRole("button", { name: /^Exterior \(reviewed\)/ }).click();
  await expect(section).toHaveValue("Exterior (reviewed)");
  await expect(page.getByRole("textbox", { name: "Item name" }).nth(1)).toHaveValue("Siding & Trim");
  await expect(page.getByText("Added by the inspector.")).toBeVisible();
  await expect(page.locator("strong", { hasText: "Important." })).toBeVisible();
});

test("opening a comment without changing it leaves it unedited", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Roof/ }).click();
  await page.getByRole("button", { name: /^Edit text of/ }).nth(3).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Edited", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Changes save automatically")).toBeVisible();
});

test("a changed comment can be restored to the imported text", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Roof/ }).click();
  const card = page.locator("article").filter({ has: page.locator(".comment-html") }).nth(1);
  const original = (await card.locator(".comment-html").innerText()).trim();
  await card.getByRole("button", { name: /^Edit text of/ }).click();
  await page.locator(".ProseMirror").press("Control+a");
  await page.keyboard.type("Temporary wording.");
  await page.getByRole("button", { name: "Done" }).click();
  await saved(page);
  await expect(card.getByText("Edited", { exact: true })).toBeVisible();

  await card.getByRole("button", { name: "Restore original" }).click();
  await saved(page);
  await expect(card.locator(".comment-html")).toHaveText(original);
  await page.reload();
  await page.getByRole("button", { name: /^Roof/ }).click();
  await expect(page.getByText(original.slice(0, 40)).first()).toBeVisible();
  await expect(page.getByText("Temporary wording.")).toHaveCount(0);
});

test("search finds comments across sections", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Search comments" }).fill("damper");
  await expect(page.getByText(/\d+ comments? found/)).toBeVisible();
  await expect(page.locator("article").filter({ has: page.getByRole("textbox", { name: "Comment name" }).and(page.locator('[value="Damper Inoperable"]')) })).toHaveCount(2);
  await page.getByRole("textbox", { name: "Search comments" }).fill("zzzz-no-match");
  await expect(page.getByText("0 comments found")).toBeVisible();
});

test("a comment can be added and deleted, and the report shows the removal", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Garage/ }).click();
  const before = await page.locator("article").count();
  await page.getByRole("button", { name: "Add comment" }).first().click();
  await saved(page);
  await expect(page.locator("article")).toHaveCount(before + 1);

  const first = page.locator("article").first();
  const name = await first.getByRole("textbox", { name: "Comment name" }).inputValue();
  await first.getByRole("button", { name: `Delete ${name}` }).click();
  await first.getByRole("button", { name: "Delete", exact: true }).click();
  await saved(page);
  await expect(page.locator("article")).toHaveCount(before);

  await page.getByRole("link", { name: "Import report", exact: true }).click();
  await page.getByRole("button", { name: /^Changed/ }).click();
  await expect(page.getByRole("row").filter({ hasText: name }).getByText("Removed")).toBeVisible();
});

test("a copy is independent of the original in both directions", async ({ page }) => {
  await page.goto("/");
  const originalUrl = page.url();
  await page.getByRole("button", { name: "Make a copy" }).click();
  await expect(page.getByText("Changes here do not affect it.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Template name" })).toHaveValue("InterNACHI-Residential (copy)");

  const section = page.getByRole("textbox", { name: "Section name" });
  await section.fill("Changed only in the copy");
  await section.blur();
  await saved(page);
  const copyUrl = page.url();

  await page.goto(originalUrl);
  await expect(section).toHaveValue("Inspection Details");
  await section.fill("Changed only in the original");
  await section.blur();
  await saved(page);

  await page.goto(copyUrl);
  await expect(section).toHaveValue("Changed only in the copy");
  await page.goto(originalUrl);
  await section.fill("Inspection Details");
  await section.blur();
  await saved(page);
  await page.goto("/templates");
  await expect(page.getByText("copied from InterNACHI-Residential")).toBeVisible();
});

test("the report tracks edits made since import", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Import report", exact: true }).click();
  await page.getByRole("button", { name: /^Changed/ }).click();
  await expect(page.getByRole("row").filter({ hasText: "Cracking - Minor" }).getByText("Edited")).toBeVisible();
  await page.getByRole("link", { name: "Cracking - Minor" }).click();
  await expect(page.locator("article.ring-2")).toContainText("Added by the inspector.");
});
