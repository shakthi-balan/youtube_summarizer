import { spawnSync } from "node:child_process"
import { applyDatabaseEnv } from "./db-env.mjs"

const { direct, pooled } = applyDatabaseEnv()

const dbEnvKeys = [
  "DATABASE_URL",
  "DIRECT_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
]

if (!direct && !pooled) {
  const seen = dbEnvKeys
    .map((key) => `  ${key}: ${process.env[key]?.trim() ? "set" : "missing"}`)
    .join("\n")

  console.error(`
Prisma needs a Postgres URL, but none was set in this Vercel environment.

This build does not load .env from the repo. Add the variables in
Vercel → Project → Settings → Environment Variables, with the same
Environment boxes checked as this deploy (Production and/or Preview):

  DATABASE_URL  Supabase Transaction pooler (port 6543)
  DIRECT_URL    Supabase Session pooler or direct (port 5432)

If you used the Supabase Vercel integration, POSTGRES_URL /
POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING are also accepted.

Status of database-related env vars in this build:
${seen}

Then start a NEW deployment (git push, or Deployments → ⋮ → Redeploy
with “Use existing Build Cache” unchecked). Replaying a failed build
that started before the variables existed will fail the same way.
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
