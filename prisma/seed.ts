import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"
import { DEFAULT_SECURITY_QUESTIONS } from "../lib/securityQuestionsData"

const connectionString =
  process.env.DIRECT_URL?.trim() ||
  process.env.POSTGRES_URL_NON_POOLING?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim() ||
  process.env.POSTGRES_URL?.trim()

if (!connectionString) {
  throw new Error("DATABASE_URL or DIRECT_URL is required to seed the database")
}

const adapter = new PrismaPg({ connectionString })
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
