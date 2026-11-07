// Read-only checks against the deployed app. Changes nothing.
// Usage: LIVE_URL=... LIVE_USER=... LIVE_PASSWORD=... npx playwright test -c e2e-live
import { expect, test } from "@playwright/test";

const user = process.env.LIVE_USER ?? "";
const password = process.env.LIVE_PASSWORD ?? "";

test("home page is public and plays the walkthrough", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("moved without retyping");
  const video = await page.request.head("/media/walkthrough.mp4", { timeout: 30000 });
  expect(video.ok()).toBe(true);
  expect(video.headers()["content-type"]).toContain("video/mp4");
});

test("wrong password is refused", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill(user);
  await page.getByLabel("Password").fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "do not match" })).toBeVisible();
});

test("reviewer signs in and lands on the verified template", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill(user);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("textbox", { name: "Template name" })).toHaveValue("InterNACHI Residential", { timeout: 30000 });
  await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("button")).toHaveCount(13);
  await page.screenshot({ path: "test-results/live-editor.png" });

  await page.getByRole("link", { name: "Import report", exact: true }).click();
  await expect(page.getByText("392 of 392 rows accounted for")).toBeVisible();
  await expect(page.getByText(/0 differences found/)).toBeVisible();
  await page.screenshot({ path: "test-results/live-report.png" });
});
