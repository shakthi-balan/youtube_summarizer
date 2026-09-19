import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL

if (!connectionString) {
  console.error("DATABASE_URL or DIRECT_URL is required to seed the database")
  process.exit(1)
}

const sqlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "seed.sql")
const sql = fs.readFileSync(sqlPath, "utf8")
const client = new pg.Client({ connectionString })

await client.connect()
await client.query(sql)
await client.end()

console.log("Security questions seeded")
