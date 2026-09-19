import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function firstEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
}

function getDatabaseUrl(): string {
  const url = firstEnv(
    'DATABASE_URL',
    'POSTGRES_PRISMA_URL',
    'POSTGRES_URL',
    'DIRECT_URL',
    'POSTGRES_URL_NON_POOLING'
  );
  if (url) {
    return url;
  }
  // Next.js production builds import this module; a dummy URL is enough because
  // no queries run until runtime, when DATABASE_URL must be set.
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return 'postgresql://postgres:postgres@localhost:5432/postgres';
  }
  throw new Error('DATABASE_URL environment variable is required');
}

const adapter = new PrismaPg({
  connectionString: getDatabaseUrl(),
  // Vercel serverless: keep the pool tiny so we do not exhaust Supabase connections.
  max: process.env.VERCEL ? 1 : 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
