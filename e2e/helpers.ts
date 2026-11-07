import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const SAMPLE = path.resolve("samples", "InterNACHI-Residential-2026-11-06.xls");
export const LOCAL_USER = { username: "reviewer", password: "local-demo-password" };

export async function signIn(page: Page, user = LOCAL_USER) {
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function upload(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  await page.goto("/import");
  await page.getByLabel("Spectora export file").setInputFiles(file);
}

export const saved = (page: Page) => expect(page.getByText("All changes saved")).toBeVisible();

export const uploadAlert = (page: Page, text: string) =>
  page.getByRole("alert").filter({ hasText: text });
