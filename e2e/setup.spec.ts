import { expect, test } from "@playwright/test";
import { AUTH_FILE } from "../playwright.config";
import { SAMPLE, signIn, upload } from "./helpers";

test("sign in and import the committed Spectora export", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await signIn(page);
  await expect(page).toHaveURL(/\/import$/, { timeout: 30000 });
  await expect(page.getByText("Signed in as reviewer")).toBeVisible();

  await upload(page, SAMPLE);
  await expect(page.getByText("392 of 392 rows accounted for")).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/compared \d+ fields across 392 rows with your original file\. 0 differences found\./)).toBeVisible();
  await expect(page.getByText("Not in Spectora's file")).toBeVisible();
  await expect(page.getByRole("button", { name: "All (392)" })).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});
