import { readFileSync } from "node:fs";
import { getDb } from "../src/lib/db/client";
import { importSpectoraFile } from "../src/lib/import/run";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {}
}

const FILE = "samples/InterNACHI-Residential-2026-11-06.xls";
const db = await getDb();
const { rows } = await db.query<{ n: number }>("select count(*)::int as n from templates");

if (rows[0].n > 0 && !process.argv.includes("--force")) {
  console.log(`${rows[0].n} template(s) already exist. Use --force to import again.`);
  process.exit(0);
}

const { templateId } = await importSpectoraFile(
  db,
  new Uint8Array(readFileSync(FILE)),
  "InterNACHI Residential -2026-11-06.xls",
);
console.log(`Seeded template ${templateId}`);
process.exit(0);
