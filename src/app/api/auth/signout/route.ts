import { type NextRequest, NextResponse } from "next/server"
import { destroySession } from "@/lib/auth-service"

export async function POST(request: NextRequest) {
  try {
    await destroySession()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(`[AUTH] Signout error:`, error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
