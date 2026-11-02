export function normalizeDatabaseUrl(url: string | undefined): string | undefined
export function withSslMode(url: string | undefined, mode?: string): string | undefined
export function pgSslConfig(
  url: string | undefined
): { rejectUnauthorized: boolean } | undefined
export function pgClientConfig(url: string | undefined): {
  connectionString: string | undefined
  ssl?: { rejectUnauthorized: boolean }
}
export function getDirectUrl(): string | undefined
export function getPooledUrl(): string | undefined
export function applyDatabaseEnv(): {
  direct: string | undefined
  pooled: string | undefined
}
