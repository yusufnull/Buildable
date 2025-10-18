import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    // Get user ID from query parameters
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Get user's project data
    const { data: projectData } = await supabase
      .from('projects')
      .select('id, name, description, v0_id')
      .eq('owner_id', userId)
      .single()

    // Get user's software (chats) data
    const { data: softwareData } = await supabase
      .from('software')
      .select('id, title, demo_url, software_id, created_at')
      .eq('project_id', projectData?.id || '')
      .order('created_at', { ascending: false })


    return NextResponse.json({
      project: projectData ? {
        id: projectData.id,
        name: projectData.name,
        description: projectData.description,
        v0_id: projectData.v0_id
      } : null,
      software: softwareData || []
    })

  } catch (error) {
    console.error(`[USER_DATA] User data loading error:`, error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
