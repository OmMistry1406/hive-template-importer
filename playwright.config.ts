import { rmSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const dataDir = path.resolve(".data", "e2e");
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve(".playwright");
if (!process.env.TEST_WORKER_INDEX) rmSync(dataDir, { recursive: true, force: true });

export const AUTH_FILE = path.resolve("test-results", ".auth", "reviewer.json");

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://localhost:3100",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: "setup", testMatch: /setup\.spec\.ts/ },
    { name: "signed-out", testMatch: /auth\.spec\.ts/, dependencies: ["setup"] },
    {
      name: "app",
      testMatch: /(workflow|negative)\.spec\.ts/,
      dependencies: ["setup"],
      use: { storageState: AUTH_FILE },
    },
  ],
  webServer: {
    command: "npm run start -- -p 3100",
    url: "http://localhost:3100/login",
    env: { PGLITE_DIR: dataDir, DATABASE_URL: "" },
    reuseExistingServer: false,
    timeout: 60000,
  },
});
