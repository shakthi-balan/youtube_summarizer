import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ensureSecurityQuestionsSeeded } from "@/lib/securityQuestions"

/**
 * GET /api/security-questions
 * Returns the list of available security questions
 */
export async function GET() {
  try {
    let questions = await prisma.securityQuestion.findMany({
      select: {
        id: true,
        question: true,
      },
      orderBy: {
        question: "asc",
      },
    })

    // Fresh installs may skip `prisma db seed` — backfill defaults if empty
    if (questions.length === 0) {
      await ensureSecurityQuestionsSeeded()
      questions = await prisma.securityQuestion.findMany({
        select: {
          id: true,
          question: true,
        },
        orderBy: {
          question: "asc",
        },
      })
    }

    return NextResponse.json({ questions })
  } catch (error) {
    console.error("Error fetching security questions:", error)
    return NextResponse.json(
      { error: "Failed to fetch security questions" },
      { status: 500 }
    )
  }
}
