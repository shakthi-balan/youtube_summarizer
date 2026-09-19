"use client"

import { useSession, signOut as authSignOut } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

/** Prevents concurrent sign-outs when many components mount useAuth */
let signingOutDueTo401 = false

/**
 * Custom auth hook that wraps better-auth's useSession
 * Provides a similar API to the old AuthContext for easier migration
 */
export function useAuth() {
  const { data: session, isPending, error, refetch } = useSession()
  const router = useRouter()
  const [setupCompleted, setSetupCompleted] = useState<boolean | null>(null)

  const user = session?.user ?? null
  const isAuthenticated = !!user

  // Fetch setupCompleted directly from API to bypass any caching issues
  useEffect(() => {
    if (!user?.id) {
      setSetupCompleted(null)
      return
    }

    let cancelled = false

    const checkSetupStatus = async () => {
      try {
        const response = await fetch("/api/user/setup-status", {
          credentials: "include",
        })

        if (cancelled) return

        // Stale cookie / rotated BETTER_AUTH_SECRET — clear client session
        if (response.status === 401) {
          setSetupCompleted(null)
          if (!signingOutDueTo401) {
            signingOutDueTo401 = true
            try {
              await authSignOut()
              await refetch()
            } finally {
              signingOutDueTo401 = false
            }
          }
          return
        }

        if (response.ok) {
          const data = await response.json()
          setSetupCompleted(Boolean(data.setupCompleted))
        } else {
          // Don't hang loading forever on transient API errors
          setSetupCompleted(
            Boolean((user as { setupCompleted?: boolean }).setupCompleted)
          )
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to check setup status:", err)
          setSetupCompleted(
            Boolean((user as { setupCompleted?: boolean }).setupCompleted)
          )
        }
      }
    }

    checkSetupStatus()

    return () => {
      cancelled = true
    }
    // Only re-check when user id changes
  }, [user?.id, refetch])

  const isLoading = isPending || (isAuthenticated && setupCompleted === null)

  const logout = useCallback(async () => {
    setSetupCompleted(null)
    await authSignOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login")
        },
      },
    })
  }, [router])

  const updateSetupCompleted = useCallback(async (completed: boolean) => {
    setSetupCompleted(completed)
    await refetch()
  }, [refetch])

  return {
    user: user
      ? {
          id: user.id,
          email: user.email,
          name: user.name,
          setupCompleted: setupCompleted ?? false,
        }
      : null,
    isAuthenticated,
    isLoading,
    error,
    logout,
    updateSetupCompleted,
    refetch,
  }
}
