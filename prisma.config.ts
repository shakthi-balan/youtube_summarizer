export default {
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'npx tsx prisma/seed.ts',
  },
  datasource: {
    // Prisma CLI (migrate/push) should use the direct Supabase connection.
    // Runtime Prisma Client uses DATABASE_URL (pooled) via lib/prisma.ts.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/postgres',
  },
}
