import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"
import { DEFAULT_SECURITY_QUESTIONS } from "../lib/securityQuestionsData"
import { applyDatabaseEnv, getDirectUrl, getPooledUrl, pgClientConfig } from "./db-env.mjs"

applyDatabaseEnv()

const connectionString = getDirectUrl() || getPooledUrl()

if (!connectionString) {
  throw new Error("DATABASE_URL or DIRECT_URL is required to seed the database")
}

const pgConfig = pgClientConfig(connectionString)
const adapter = new PrismaPg({
  connectionString: pgConfig.connectionString,
  ssl: pgConfig.ssl,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("Seeding security questions...")

  for (const question of DEFAULT_SECURITY_QUESTIONS) {
    await prisma.securityQuestion.upsert({
      where: { question },
      update: {},
      create: { question },
    })
  }

  console.log(`Seeded ${DEFAULT_SECURITY_QUESTIONS.length} security questions`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
