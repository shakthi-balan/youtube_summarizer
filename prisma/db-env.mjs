function firstEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
}

/**
 * Encode an unescaped password so `user:p@ss@host` is not parsed as host `p`.
 * Uses the last `@` before the path as the host separator.
 */
export function normalizeDatabaseUrl(url) {
  if (!url) return url
  const trimmed = url.trim().replace(/^["']|["']$/g, "")
  const schemeIdx = trimmed.indexOf("://")
  if (schemeIdx < 0) return trimmed

  const scheme = trimmed.slice(0, schemeIdx + 3)
  const rest = trimmed.slice(schemeIdx + 3)
  const pathIdx = rest.indexOf("/")
  const atIdx = rest.lastIndexOf("@", pathIdx === -1 ? rest.length : pathIdx)
  if (atIdx < 0) return trimmed

  const userinfo = rest.slice(0, atIdx)
  const hostAndPath = rest.slice(atIdx + 1)
  const colon = userinfo.indexOf(":")
  if (colon < 0) return trimmed

  const user = userinfo.slice(0, colon)
  const password = userinfo.slice(colon + 1)
  if (!password) return trimmed

  let decoded = password
  try {
    decoded = decodeURIComponent(password)
  } catch {
    decoded = password
  }
  return `${scheme}${user}:${encodeURIComponent(decoded)}@${hostAndPath}`
}

function isLocalPostgres(url) {
  const host = url?.match(/@([^:/?]+)/)?.[1] ?? ""
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]"
}

function stripQueryParam(url, name) {
  return url
    .replace(new RegExp(`([?&])${name}=[^&]*`, "gi"), "$1")
    .replace(/\?&/, "?")
    .replace(/[?&]$/, "")
    .replace(/&&+/g, "&")
}

/** Prisma/libpq: encrypt the session if the URL has no sslmode yet. */
export function withSslMode(url, mode = "require") {
  if (!url || isLocalPostgres(url)) return url
  const normalized = normalizeDatabaseUrl(url)
  if (/[?&]sslmode=/i.test(normalized)) return normalized
  return `${normalized}${normalized.includes("?") ? "&" : "?"}sslmode=${mode}`
}

export function pgSslConfig(url) {
  if (!url || isLocalPostgres(url)) return undefined
  return { rejectUnauthorized: false }
}

/**
 * node-postgres currently treats sslmode=require as verify-full, which
 * rejects Supabase's pooler chain (SELF_SIGNED_CERT_IN_CHAIN).
 * Strip sslmode and keep TLS without CA verification.
 */
export function pgClientConfig(url) {
  const normalized = withSslMode(normalizeDatabaseUrl(url))
  if (!normalized || isLocalPostgres(normalized)) {
    return { connectionString: normalized }
  }

  const connectionString = stripQueryParam(
    stripQueryParam(normalized, "sslmode"),
    "uselibpqcompat"
  )

  return {
    connectionString,
    ssl: { rejectUnauthorized: false },
  }
}

export function getDirectUrl() {
  const url = firstEnv(
    "DIRECT_URL",
    "POSTGRES_URL_NON_POOLING",
    "POSTGRES_URL",
    "DATABASE_URL",
    "POSTGRES_PRISMA_URL"
  )
  return url ? normalizeDatabaseUrl(url) : url
}

export function getPooledUrl() {
  const url = firstEnv(
    "DATABASE_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL",
    "DIRECT_URL",
    "POSTGRES_URL_NON_POOLING"
  )
  return url ? normalizeDatabaseUrl(url) : url
}

export function applyDatabaseEnv() {
  const direct = getDirectUrl()
  const pooled = getPooledUrl()
  if (direct) {
    process.env.DIRECT_URL = withSslMode(direct)
  }
  if (pooled) {
    process.env.DATABASE_URL = withSslMode(pooled)
  }
  return { direct, pooled }
}
