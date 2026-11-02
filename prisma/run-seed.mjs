import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"
import { applyDatabaseEnv, getDirectUrl, getPooledUrl, pgClientConfig } from "./db-env.mjs"

applyDatabaseEnv()
const connectionString = getDirectUrl() || getPooledUrl()

if (!connectionString) {
  console.error("DATABASE_URL or DIRECT_URL is required to seed the database")
  process.exit(1)
}

const sqlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "seed.sql")
const sql = fs.readFileSync(sqlPath, "utf8")
const client = new pg.Client({
  ...pgClientConfig(connectionString),
})

try {
  await client.connect()
  await client.query(sql)
  console.log("Security questions seeded")
} catch (error) {
  console.error("Seed failed:", error)
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}
