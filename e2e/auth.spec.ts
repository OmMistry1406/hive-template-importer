import { expect, test } from "@playwright/test";
import { LOCAL_USER, signIn } from "./helpers";

test("signed-out visitors are sent to sign in, then back where they were", async ({ page }) => {
  await page.goto("/templates");
  await expect(page).toHaveURL(/\/login\?next=%2Ftemplates/);
  await expect(page.getByRole("heading", { name: "Bring a template across intact." })).toBeVisible();
  await signIn(page);
  await expect(page).toHaveURL(/\/templates$/);
});

test("a wrong password is refused", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, { username: LOCAL_USER.username, password: "wrong-password" });
  await expect(page.getByRole("alert").filter({ hasText: "do not match" })).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("the upload API refuses requests without a session", async ({ request }) => {
  const response = await request.post("/api/imports", { multipart: { file: { name: "a.xls", mimeType: "application/octet-stream", buffer: Buffer.from("x") } } });
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({ code: "unauthenticated" });
});

test("a forged session cookie is refused", async ({ page, context }) => {
  await context.addCookies([{ name: "ti_session", value: "reviewer.9999999999.forged", url: "http://localhost:3100" }]);
  await page.goto("/templates");
  await expect(page).toHaveURL(/\/login/);
});

test("the sign-in page cannot redirect to another site", async ({ page }) => {
  await page.goto("/login?next=//evil.example");
  await signIn(page);
  await expect(page).toHaveURL(/localhost:3100\/templates\//);
});

test("signing out ends the session", async ({ page }) => {
  await page.goto("/login");
  await signIn(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/templates");
  await expect(page).toHaveURL(/\/login/);
});
