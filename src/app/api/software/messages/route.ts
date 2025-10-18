import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    const { searchParams } = new URL(request.url)
    const softwareId = searchParams.get('softwareId')
    const userId = searchParams.get('userId')
    if (!softwareId || !userId) {
      return NextResponse.json({ error: 'Software ID and User ID are required' }, { status: 400 })
    }

    // Verify software ownership
    const { data: software, error: softwareError } = await supabase
      .from('software')
      .select(`
        *,
        projects!inner(owner_id)
      `)
      .eq('id', softwareId)
      .eq('projects.owner_id', userId)
      .single()

    if (softwareError || !software) {
      return NextResponse.json({ error: 'Software not found' }, { status: 404 })
    }


    // Get messages for this software
    const { data: messages, error: messagesError } = await supabase
      .from('software_messages')
      .select('id, role, content, created_at')
      .eq('software_id', softwareId)
      .order('created_at', { ascending: false })

    if (messagesError) {
      return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
    }


    return NextResponse.json({
      software: {
        id: software.id,
        title: software.title,
        demoUrl: software.demo_url,
        chatId: software.software_id
      },
      messages: messages || []
    })

  } catch (error) {
    console.error(`[MESSAGES] Messages loading error:`, error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
