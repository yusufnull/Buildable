import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()

    const body = await request.json()
    const { title, prompt, projectId, userId } = body

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    if (!title || !prompt || !projectId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get user's project to verify ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('owner_id', userId)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!project.v0_id) {
      return NextResponse.json({ error: 'Project does not have v0_id' }, { status: 400 })
    }

    // Create job record
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        user_id: userId,
        project_id: projectId,
        kind: 'v0_software_generation',
        status: 'pending',
        input: {
          title,
          prompt,
          projectId: project.v0_id
        }
      })
      .select()
      .single()

    if (jobError) {
      console.error(`[SOFTWARE] Failed to create job record:`, jobError)
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
    }


    // For now, simulate the job processing directly
    // TODO: Implement proper Supabase Queue integration

    // Update job status to processing
    await supabase
      .from('jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('id', job.id)

    // Simulate the v0 processing (this would normally be done by the edge function)
    // We'll process it synchronously for now to get the basic flow working
    try {
      const v0ApiKey = process.env.V0_API_KEY
      if (!v0ApiKey) {
        throw new Error('V0_API_KEY not configured')
      }

      // Import v0 client dynamically
      const { createClient } = await import('v0-sdk')
      const v0Client = createClient({ apiKey: v0ApiKey })

      const chatResult = await v0Client.chats.create({
        projectId: project.v0_id,
        message: prompt,
        async: true,
      })

      // Poll for completion
      let demoUrl = chatResult.latestVersion?.demoUrl
      let assistantMessage: string | undefined

      const maxAttempts = 10
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {

        try {
          const completedChat = await v0Client.chats.getById({ chatId: chatResult.id })
          demoUrl = completedChat.latestVersion?.demoUrl
          assistantMessage = completedChat.messages?.find((msg: any) => msg.role === 'assistant')?.content

          // If we have a demo URL, we're done
          if (demoUrl) {
            break
          }

          // If we have an assistant message but no demo URL, v0 is asking for clarification
          if (assistantMessage && !demoUrl) {
            break
          }

        } catch (pollError) {
          console.warn(`[SOFTWARE] Poll attempt ${attempt} failed:`, pollError)
        }

        // Wait 30 seconds before next attempt (unless this is the last attempt)
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 30000))
        }
      }

      // Check final result - either we have a demo URL (success) or we have a clarification message
      const hasDemoUrl = !!demoUrl
      const hasClarification = !!assistantMessage && !demoUrl

      if (!hasDemoUrl && !hasClarification) {
        throw new Error('No demo URL or clarification message from v0 after polling')
      }


      // Create software record (handles both scenarios: with and without demo URL)
      const { data: software, error: softwareError } = await supabase
        .from('software')
        .insert({
          project_id: projectId,
          title: title,
          demo_url: demoUrl || null, // Can be null if v0 needs clarification
          url: chatResult.webUrl,
          software_id: chatResult.id
        })
        .select()
        .single()

      if (softwareError) {
        throw new Error(`Failed to save software: ${softwareError.message}`)
      }


      // Add user message
      await supabase
        .from('software_messages')
        .insert({
          software_id: software.id,
          role: 'user',
          content: prompt
        })

      // Add assistant message (could be a clarification question or actual response)
      if (assistantMessage) {
        await supabase
          .from('software_messages')
          .insert({
            software_id: software.id,
            role: 'assistant',
            content: assistantMessage
          })
      }

      // Update job as completed
      await supabase
        .from('jobs')
        .update({
          status: 'completed',
          result: {
            software: {
              id: software.id,
              title: software.title,
              demoUrl: software.demo_url,
              chatId: software.software_id
            }
          },
          finished_at: new Date().toISOString()
        })
        .eq('id', job.id)

      return NextResponse.json({
        success: true,
        jobId: job.id,
        message: 'Job completed successfully'
      })

    } catch (processingError) {
      console.error(`[SOFTWARE] Job processing failed:`, processingError)

      // Update job status to failed
      await supabase
        .from('jobs')
        .update({
          status: 'failed',
          error: processingError instanceof Error ? processingError.message : 'Unknown error',
          finished_at: new Date().toISOString()
        })
        .eq('id', job.id)

      return NextResponse.json({
        error: 'Job processing failed',
        jobId: job.id
      }, { status: 500 })
    }

  } catch (error) {
    console.error(`[SOFTWARE] Software generation error:`, error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
