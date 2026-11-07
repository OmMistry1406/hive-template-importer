import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve(".playwright");

export default defineConfig({
  testDir: ".",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.LIVE_URL ?? "https://hive-template-importer-theta.vercel.app",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
});
