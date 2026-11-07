import { rmSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const dataDir = path.resolve(".data", "e2e");
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve(".playwright");
if (!process.env.TEST_WORKER_INDEX) rmSync(dataDir, { recursive: true, force: true });

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://localhost:3100", screenshot: "only-on-failure" },
  webServer: {
    command: "npm run start -- -p 3100",
    url: "http://localhost:3100/import",
    env: { PGLITE_DIR: dataDir, DATABASE_URL: "" },
    reuseExistingServer: false,
    timeout: 60000,
  },
});
