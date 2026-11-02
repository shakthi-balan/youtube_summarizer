import { config as loadEnv } from "dotenv"
import path from "node:path"
import pg from "pg"

loadEnv({ path: path.join(process.cwd(), ".env") })
loadEnv({ path: path.join(process.cwd(), ".env.local"), override: true })

function nodePgClientConfig(url: string) {
  const parsed = new URL(url)
  const local =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "::1"
  parsed.searchParams.delete("sslmode")
  parsed.searchParams.delete("uselibpqcompat")
  return {
    connectionString: parsed.toString(),
    ssl: local ? undefined : { rejectUnauthorized: false },
  }
}

async function ping(url: string | undefined) {
  if (!url?.trim()) {
    throw new Error("URL is empty")
  }

  const client = new pg.Client({
    ...nodePgClientConfig(url.trim()),
    connectionTimeoutMillis: 8_000,
  })

  try {
    await client.connect()
    const result = await client.query<{ ok: number; server_port: number }>(
      "SELECT 1 AS ok, inet_server_port() AS server_port"
    )
    return result.rows[0]
  } finally {
    await client.end().catch(() => {})
  }
}

const databaseUrl = process.env.DATABASE_URL?.trim()
const directUrl = process.env.DIRECT_URL?.trim()

const describeTransaction = databaseUrl ? describe : describe.skip
const describeSession = directUrl ? describe : describe.skip

describeTransaction("Supabase transaction pool (DATABASE_URL)", () => {
  it("accepts SELECT 1", async () => {
    const row = await ping(databaseUrl)
    expect(row.ok).toBe(1)
    expect(row.server_port).toBeGreaterThan(0)
  })
})

describeSession("Supabase session / direct pool (DIRECT_URL)", () => {
  it("accepts SELECT 1", async () => {
    const row = await ping(directUrl)
    expect(row.ok).toBe(1)
    expect(row.server_port).toBeGreaterThan(0)
  })
})
