import { getDb } from "../src/lib/db/client";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {}
}

// Reports schema health for the database in DATABASE_URL.
const db = await getDb();
const q = async (sql: string) => (await db.query(sql)).rows;
console.table(await q(`select relname as table, relrowsecurity as rls,
  (select count(*) from pg_policies p where p.tablename = c.relname) as policies
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and relkind = 'r' order by relname`));
console.table(await q(`select grantee, privilege_type from information_schema.routine_privileges
  where routine_name = 'copy_template' order by grantee`));
console.table(await q(`select t.name, (select count(*) from sections s where s.template_id = t.id) as sections,
  r.verification->>'ok' as verified, r.verification->>'fieldsChecked' as fields_checked
  from templates t left join import_runs r on r.id = t.import_run_id`));
process.exit(0);
