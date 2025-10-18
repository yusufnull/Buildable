import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSession } from "@/lib/auth-service"

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message || "Login failed" }, { status: 400 })
    }


    // Get user's data from the database
    const { data: userData } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', authData.user.id)
      .single()

    // Get user's project data
    const { data: projectData } = await supabase
      .from('projects')
      .select('id, name, description, v0_id')
      .eq('owner_id', authData.user.id)
      .single()


    const sessionData = {
      userId: authData.user.id,
      email: authData.user.email || "",
      displayName: userData?.display_name || authData.user.user_metadata?.display_name || authData.user.email || "",
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    }


    // Session will be created on client side

    return NextResponse.json({
      success: true,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        display_name: sessionData.displayName,
        metadata: authData.user.user_metadata,
        created_at: authData.user.created_at,
      },
      project: projectData ? {
        id: projectData.id,
        name: projectData.name,
        description: projectData.description,
        v0_id: projectData.v0_id
      } : null,
    })
  } catch (error) {
    console.error(`[AUTH] Login error:`, error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
