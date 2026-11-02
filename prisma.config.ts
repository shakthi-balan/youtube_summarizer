import "dotenv/config"
import { defineConfig } from "prisma/config"
import { applyDatabaseEnv, getDirectUrl, getPooledUrl, withSslMode } from "./prisma/db-env.mjs"

applyDatabaseEnv()

const datasourceUrl = withSslMode(
  getDirectUrl() ||
    getPooledUrl() ||
    "postgresql://postgres:postgres@localhost:5432/postgres"
)

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: datasourceUrl,
  },
})
