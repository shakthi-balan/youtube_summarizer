function firstEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
}

export function getDirectUrl() {
  return firstEnv(
    "DIRECT_URL",
    "POSTGRES_URL_NON_POOLING",
    "POSTGRES_URL",
    "DATABASE_URL",
    "POSTGRES_PRISMA_URL"
  )
}

export function getPooledUrl() {
  return firstEnv(
    "DATABASE_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL",
    "DIRECT_URL",
    "POSTGRES_URL_NON_POOLING"
  )
}

export function applyDatabaseEnv() {
  const direct = getDirectUrl()
  const pooled = getPooledUrl()
  if (direct && !process.env.DIRECT_URL?.trim()) {
    process.env.DIRECT_URL = direct
  }
  if (pooled && !process.env.DATABASE_URL?.trim()) {
    process.env.DATABASE_URL = pooled
  }
  return { direct, pooled }
}
