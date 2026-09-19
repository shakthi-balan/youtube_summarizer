import { spawnSync } from "node:child_process"
import { applyDatabaseEnv } from "./db-env.mjs"

const { direct, pooled } = applyDatabaseEnv()

if (!direct && !pooled) {
  console.error(`
Prisma needs a Postgres URL, but none was set in this Vercel environment.

In Vercel → Project → Settings → Environment Variables, add both
for Production (and Preview if you use preview deploys):

  DATABASE_URL  Supabase Transaction pooler (port 6543)
  DIRECT_URL    Supabase Session pooler or direct (port 5432)

If you used the Supabase Vercel integration, POSTGRES_URL /
POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING are also accepted.

Then redeploy. Do not rebuild the old failed deployment.
`)
  process.exit(1)
}

function run(command) {
  const result = spawnSync(command, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  })
  if (result.status) {
    process.exit(result.status)
  }
}

run("npx prisma generate")
run("npx prisma migrate deploy")
run("node prisma/run-seed.mjs")
run("npx next build")
