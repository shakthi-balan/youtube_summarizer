/**
 * Ping Supabase with the same SSL settings the app uses.
 *
 *   npm run db:test-connection
 *
 * Reads .env then .env.local. Does not print passwords or full URLs.
 */
import path from "node:path"
import { fileURLToPath } from "node:url"
import { config as loadEnv } from "dotenv"
import pg from "pg"
import { pgClientConfig, withSslMode } from "./db-env.mjs"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
loadEnv({ path: path.join(root, ".env") })
loadEnv({ path: path.join(root, ".env.local"), override: true })

const PROBE_SQL = `
  SELECT
    1 AS ok,
    current_database() AS database,
    current_user AS db_user,
    inet_server_port() AS server_port,
    version() AS version
`

export function summarizeUrl(url) {
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    database: parsed.pathname.replace(/^\//, "") || "postgres",
    sslmode: parsed.searchParams.get("sslmode") || "(unset)",
    pgbouncer: parsed.searchParams.get("pgbouncer") === "true",
  }
}

export async function pingPostgres(label, url) {
  if (!url?.trim()) {
    return { label, ok: false, error: "environment variable is empty or missing" }
  }

  const connectionString = withSslMode(url.trim())
  const summary = summarizeUrl(connectionString)
  const client = new pg.Client({
    ...pgClientConfig(connectionString),
    connectionTimeoutMillis: 8_000,
  })

  try {
    await client.connect()
    const { rows } = await client.query(PROBE_SQL)
    return { label, ok: true, summary, row: rows[0] }
  } catch (error) {
    return {
      label,
      ok: false,
      summary,
      error: error instanceof Error ? error.message : String(error),
      code: error && typeof error === "object" && "code" in error ? error.code : undefined,
    }
  } finally {
    await client.end().catch(() => {})
  }
}

export function getPoolTargets() {
  return [
    {
      label: "DATABASE_URL (transaction pooler, typically :6543)",
      url: process.env.DATABASE_URL,
    },
    {
      label: "DIRECT_URL (session pool / direct, typically :5432)",
      url: process.env.DIRECT_URL,
    },
  ]
}

function printResult(result) {
  console.log(`\n${result.label}`)
  if (result.summary) {
    console.log(
      `  host=${result.summary.host} port=${result.summary.port} db=${result.summary.database} sslmode=${result.summary.sslmode} pgbouncer=${result.summary.pgbouncer}`
    )
  }
  if (result.ok) {
    console.log(`  status=ok server_port=${result.row.server_port}`)
    console.log(`  user=${result.row.db_user} database=${result.row.database}`)
    console.log(`  ${String(result.row.version).split(",")[0]}`)
    return
  }
  console.log(`  status=FAIL ${result.code ? `(${result.code}) ` : ""}${result.error}`)
}

async function main() {
  const targets = getPoolTargets()
  const uniqueUrls = new Set(targets.map((t) => t.url?.trim()).filter(Boolean))
  if (uniqueUrls.size === 1 && targets.every((t) => t.url?.trim())) {
    console.warn(
      "Warning: DATABASE_URL and DIRECT_URL are identical. Use the transaction pooler (:6543) for DATABASE_URL and the session/direct URL (:5432) for DIRECT_URL."
    )
  }

  const results = []
  for (const target of targets) {
    results.push(await pingPostgres(target.label, target.url))
  }
  for (const result of results) printResult(result)

  const failed = results.filter((r) => !r.ok)
  if (failed.length) {
    console.error(`\n${failed.length} of ${results.length} connection tests failed.`)
    process.exit(1)
  }
  console.log("\nBoth Supabase pool URLs accepted SELECT 1.")
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  main()
}
