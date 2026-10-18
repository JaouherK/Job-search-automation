import { execFileSync } from "node:child_process";

import { Pool } from "pg";

// What the end-to-end tests (E11-2) run against: a production build on its
// own port, with its own database and a fake AI server, so a run never
// touches development data.

export const APP_PORT = 3100;
export const FAKE_AI_PORT = 3999;
export const FAKE_JOBS_PORT = 3998;
export const PASSWORD = "e2e-password";
/** DOSSIER_PASSWORD for the run: `printf 'e2e-password' | npm run -s hash-password`. */
const PASSWORD_HASH = "argon2id:m=19456,t=2,p=1:wk-0a22NLDwpNVDMxLY9rw:x4bAXEh9EtlaTIqLiHwF_omyDOpcPtwPrV0_SJx_y2c";
export const STORAGE_STATE = "e2e/.auth/state.json";

/**
 * DATABASE_URL with "_e2e" added to the database name (or E2E_DATABASE_URL).
 * Refuses any other name, so the tests can never wipe real data.
 */
export function e2eDatabaseUrl(): string {
  const explicit = process.env.E2E_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!explicit && !base) throw new Error("End-to-end tests need DATABASE_URL or E2E_DATABASE_URL.");
  const url = new URL(explicit ?? base!);
  if (!explicit) url.pathname = `${url.pathname}_e2e`;
  if (!url.pathname.endsWith("_e2e")) {
    throw new Error(`Refusing to run end-to-end tests against "${url.pathname.slice(1)}": its name must end in "_e2e".`);
  }
  return url.toString();
}

/** The app's environment for a run. */
export function appEnv(): Record<string, string> {
  return {
    DATABASE_URL: e2eDatabaseUrl(),
    DOSSIER_PASSWORD: PASSWORD_HASH,
    DOSSIER_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e",
    DOSSIER_DATA_DIR: "/tmp/dossier-e2e",
    DOSSIER_AI_PROVIDER: "openai",
    DOSSIER_AI_URL: `http://localhost:${FAKE_AI_PORT}/v1`,
    DOSSIER_AI_MODEL: "fake-model",
    DOSSIER_AI_KEY: "e2e-fake-key",
    // Find jobs searches the fake job sources (E14-9).
    DOSSIER_JOBS_SOURCE: "jsearch",
    DOSSIER_JSEARCH_KEY: "e2e-jsearch-key",
    DOSSIER_JOBS_TEST_BASE_URL: `http://localhost:${FAKE_JOBS_PORT}`,
    // A production server, so it would send the usage ping.
    DOSSIER_TELEMETRY: "off",
    PORT: String(APP_PORT),
  };
}

let pool: Pool | undefined;

/** Runs SQL against the test database, for setting up and checking data. */
export async function sql<Row extends object = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<Row[]> {
  pool ??= new Pool({ connectionString: e2eDatabaseUrl(), max: 2 });
  return (await pool.query<Row>(text, values)).rows;
}

/** Empties every table, then loads the built-in themes and the demo data. */
export async function resetData(): Promise<void> {
  const tables = await sql<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  );
  await sql(`TRUNCATE TABLE ${tables.map(({ tablename }) => `"${tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  execFileSync("npx", ["prisma", "db", "seed", "--", "--demo"], {
    env: { ...process.env, DATABASE_URL: e2eDatabaseUrl() },
    stdio: "pipe",
  });
}

/** How many searches the fake JSearch has answered so far (E14-10). */
export async function fakeJobSearches(): Promise<number> {
  const response = await fetch(`http://localhost:${FAKE_JOBS_PORT}/searches`);
  return ((await response.json()) as { searches: number }).searches;
}
