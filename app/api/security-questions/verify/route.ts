import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcrypt"
import { checkRateLimit } from "@/lib/rateLimit"
import {
  createResetToken,
  getClientIdentifier,
  passwordResetIdentifier,
} from "@/lib/securityQuestions"

interface VerifyAnswer {
  questionId: string
  answer: string
}

const GENERIC_VERIFY_ERROR = "Invalid email or security answers"

/**
 * POST /api/security-questions/verify
 * Verify security question answers for password reset
 * Requires 2 out of 3 correct answers
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit(`sq-verify:${getClientIdentifier(request)}`, 5, 60 * 1000)
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
    const { email, answers } = body as { email: string; answers: VerifyAnswer[] }

    if (!email || !answers || answers.length !== 2) {
      return NextResponse.json(
        { error: "Email and exactly 2 answers are required" },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
        },
      },
    })

    // Always burn some time on failure paths to reduce timing leaks
    const failDelay = async () => {
      await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 500))
    }

    if (!user) {
      await failDelay()
      return NextResponse.json(
        { error: GENERIC_VERIFY_ERROR },
        { status: 401 }
      )
    }

    const userQuestions = await prisma.userSecurityQuestion.findMany({
      where: { userId: user.id },
    })

    if (userQuestions.length < 3) {
      await failDelay()
      return NextResponse.json(
        { error: GENERIC_VERIFY_ERROR },
        { status: 401 }
      )
    }

    let correctCount = 0
    for (const answer of answers) {
      if (!answer?.questionId || typeof answer.answer !== "string") {
        continue
      }
      const userQuestion = userQuestions.find((q) => q.questionId === answer.questionId)
      if (userQuestion) {
        const isCorrect = await bcrypt.compare(
          answer.answer.toLowerCase().trim(),
          userQuestion.answerHash
        )
        if (isCorrect) {
          correctCount++
        }
      }
    }

    if (correctCount < 2) {
      await failDelay()
      return NextResponse.json(
        { error: GENERIC_VERIFY_ERROR },
        { status: 401 }
      )
    }

    const { token: resetToken, tokenHash } = createResetToken()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
    const identifier = passwordResetIdentifier(normalizedEmail)

    // Delete any existing password-reset tokens for this email before creating a new one
    await prisma.verification.deleteMany({
      where: { identifier },
    })

    await prisma.verification.create({
      data: {
        identifier,
        value: tokenHash,
        expiresAt,
      },
    })

    return NextResponse.json({
      success: true,
      resetToken,
      message: "Security questions verified successfully",
    })
  } catch (error) {
    console.error("Error verifying security questions:", error)
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    )
  }
}
