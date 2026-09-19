import { createHash, randomUUID } from "crypto"
import { prisma } from "@/lib/prisma"
import { DEFAULT_SECURITY_QUESTIONS } from "@/lib/securityQuestionsData"

export { DEFAULT_SECURITY_QUESTIONS }

const PASSWORD_RESET_PREFIX = "password-reset:"

/**
 * Ensures the default security questions exist in the database.
 * Safe to call repeatedly (uses upsert).
 */
export async function ensureSecurityQuestionsSeeded(): Promise<number> {
  for (const question of DEFAULT_SECURITY_QUESTIONS) {
    await prisma.securityQuestion.upsert({
      where: { question },
      update: {},
      create: { question },
    })
  }
  return DEFAULT_SECURITY_QUESTIONS.length
}

export function passwordResetIdentifier(email: string): string {
  return `${PASSWORD_RESET_PREFIX}${email.toLowerCase().trim()}`
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function createResetToken(): { token: string; tokenHash: string } {
  const token = randomUUID()
  return { token, tokenHash: hashResetToken(token) }
}

export function getClientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown"
  }
  return request.headers.get("x-real-ip") || "unknown"
}
