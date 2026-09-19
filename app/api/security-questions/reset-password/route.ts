import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validatePassword } from "@/lib/auth-server"
import bcrypt from "bcrypt"
import { checkRateLimit } from "@/lib/rateLimit"
import {
  getClientIdentifier,
  hashResetToken,
  passwordResetIdentifier,
} from "@/lib/securityQuestions"

/**
 * POST /api/security-questions/reset-password
 * Reset password after security question verification
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit(`sq-reset:${getClientIdentifier(request)}`, 5, 60 * 1000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rateLimit.retryAfterMs || 60000) / 1000)),
          },
        }
      )
    }

    const body = await request.json()
    const { email, resetToken, newPassword } = body as {
      email: string
      resetToken: string
      newPassword: string
    }

    if (!email || !resetToken || !newPassword) {
      return NextResponse.json(
        { error: "Email, reset token, and new password are required" },
        { status: 400 }
      )
    }

    const passwordValidation = validatePassword(newPassword)
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.error },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()
    const identifier = passwordResetIdentifier(normalizedEmail)
    const tokenHash = hashResetToken(resetToken)

    const verification = await prisma.verification.findFirst({
      where: {
        identifier,
        value: tokenHash,
        expiresAt: {
          gt: new Date(),
        },
      },
    })

    if (!verification) {
      return NextResponse.json(
        { error: "Invalid or expired reset token" },
        { status: 401 }
      )
    }

    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
        },
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: "Invalid or expired reset token" },
        { status: 401 }
      )
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)

    await prisma.account.updateMany({
      where: {
        userId: user.id,
        providerId: "credential",
      },
      data: {
        password: passwordHash,
      },
    })

    await prisma.verification.delete({
      where: { id: verification.id },
    })

    await prisma.session.deleteMany({
      where: { userId: user.id },
    })

    return NextResponse.json({
      success: true,
      message: "Password reset successfully. Please sign in with your new password.",
    })
  } catch (error) {
    console.error("Error resetting password:", error)
    return NextResponse.json(
      { error: "Failed to reset password" },
      { status: 500 }
    )
  }
}
