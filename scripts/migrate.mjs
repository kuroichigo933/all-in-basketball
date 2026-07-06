// Database migration runner.
//
// Applies any SQL files in supabase/migrations/ that haven't been recorded in
// the schema_migrations table yet, in filename order, each in a transaction.
//
// Runs automatically as part of `npm run build` (see package.json), but only
// actually touches the DB on a PRODUCTION Vercel build. Preview deploys and
// local builds skip cleanly so a feature branch can never mutate prod.
//
// Requires SUPABASE_DB_URL — a direct Postgres connection string (Supabase →
// Settings → Database → Connection string). NOT the service-role key, which
// only speaks to PostgREST and cannot run DDL.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

// Load .env.local for local runs (`npm run migrate`) — plain node doesn't read
// it the way Next.js does. No-op on Vercel (no such file) and never overrides
// vars already present in the environment.
function loadEnvLocal() {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvLocal();

const { VERCEL_ENV, SUPABASE_DB_URL } = process.env;

function log(msg) {
  console.log(`[migrate] ${msg}`);
}

// --- Decide whether to run ---------------------------------------------------
if (VERCEL_ENV && VERCEL_ENV !== "production") {
  log(`VERCEL_ENV=${VERCEL_ENV} — skipping migrations (non-production build).`);
  process.exit(0);
}
if (!SUPABASE_DB_URL) {
  if (VERCEL_ENV === "production") {
    log("ERROR: production build but SUPABASE_DB_URL is not set.");
    process.exit(1);
  }
  log("SUPABASE_DB_URL not set — skipping migrations (local build).");
  process.exit(0);
}

async function main() {
  const client = new pg.Client({
    connectionString: SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }, // Supabase requires SSL
  });
  await client.connect();
  log("connected.");

  try {
    await client.query(`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const { rows } = await client.query("select version from schema_migrations");
    const applied = new Set(rows.map((r) => r.version));

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let ran = 0;
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      if (applied.has(version)) {
        log(`skip ${version} (already applied).`);
        continue;
      }

      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      log(`applying ${version} …`);
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into schema_migrations (version) values ($1)", [version]);
        await client.query("commit");
        log(`applied ${version}.`);
        ran++;
      } catch (err) {
        await client.query("rollback").catch(() => {});
        log(`FAILED ${version}: ${err.message}`);
        throw err;
      }
    }

    log(ran === 0 ? "up to date, nothing to apply." : `done — applied ${ran} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  log(`migration run failed: ${err.message}`);
  process.exit(1);
});
