import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit } from "@/lib/rateLimit"
import { getClientIdentifier } from "@/lib/securityQuestions"

const GENERIC_LOOKUP_MESSAGE =
  "If an account exists for this email with recovery enabled, security questions will be shown."

/**
 * POST /api/security-questions/user
 * Get the security questions (without answers) for a user by email
 * Used during password reset flow
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit(`sq-user:${getClientIdentifier(request)}`, 5, 60 * 1000)
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
    const { email } = body as { email: string }

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      )
    }

    // Constant-ish delay to reduce timing/user enumeration signals
    const delayMs = 300 + Math.random() * 300
    await new Promise((resolve) => setTimeout(resolve, delayMs))

    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: email.toLowerCase().trim(),
        },
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: GENERIC_LOOKUP_MESSAGE },
        { status: 404 }
      )
    }

    const userQuestions = await prisma.userSecurityQuestion.findMany({
      where: { userId: user.id },
      include: {
        question: {
          select: {
            id: true,
            question: true,
          },
        },
      },
      orderBy: {
        questionOrder: "asc",
      },
    })

    if (userQuestions.length < 3) {
      // Same response as unknown email to avoid account-state enumeration
      return NextResponse.json(
        { error: GENERIC_LOOKUP_MESSAGE },
        { status: 404 }
      )
    }

    const questions = userQuestions.map((uq) => ({
      id: uq.question.id,
      question: uq.question.question,
    }))

    return NextResponse.json({
      success: true,
      questions,
    })
  } catch (error) {
    console.error("Error fetching user security questions:", error)
    return NextResponse.json(
      { error: "Failed to fetch security questions" },
      { status: 500 }
    )
  }
}
