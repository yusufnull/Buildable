import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { sendV0Message } from '@/lib/v0-service'

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    const body = await request.json()
    const { softwareId, message, userId } = body
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    if (!softwareId || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get software record and verify ownership
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

    if (!software.software_id) {
      return NextResponse.json({ error: 'Software does not have chat ID' }, { status: 400 })
    }

    // Send message to v0
    
    const v0Result = await sendV0Message({
      chatId: software.software_id,
      message
    })

    if (v0Result.error) {
      return NextResponse.json({ error: v0Result.error }, { status: 500 })
    }

    // Save user message
    const { error: userMessageError } = await supabase
      .from('software_messages')
      .insert({
        software_id: softwareId,
        role: 'user',
        content: message
      })

    if (userMessageError) {
      console.error(`[CHAT] Failed to save user message:`, userMessageError)
    } else {
    }

    // Save v0 response message if provided
    if (v0Result.message) {
      const { error: v0MessageError } = await supabase
        .from('software_messages')
        .insert({
          software_id: softwareId,
          role: 'assistant',
          content: v0Result.message
        })

      if (v0MessageError) {
        console.error(`[CHAT] Failed to save v0 response message:`, v0MessageError)
      } else {
      }
    }

    // Update software with new URLs if provided
    if (v0Result.demoUrl || v0Result.chatUrl) {
      const updateData: any = {}
      if (v0Result.demoUrl) updateData.demo_url = v0Result.demoUrl
      if (v0Result.chatUrl) updateData.url = v0Result.chatUrl
      
      const { error: updateError } = await supabase
        .from('software')
        .update(updateData)
        .eq('id', softwareId)

      if (updateError) {
        console.error(`[CHAT] Failed to update URLs:`, updateError)
      } else {
      }
    }

    return NextResponse.json({
      demoUrl: v0Result.demoUrl || software.demo_url,
      message: 'Message sent successfully'
    })

  } catch (error) {
    console.error(`[CHAT] Chat message error:`, error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
