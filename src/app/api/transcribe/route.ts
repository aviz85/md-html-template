import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Middleware to check authentication
async function checkAuth(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized - Please login' },
      { status: 401 }
    )
  }

  return session
}

export async function POST(req: Request) {
  // Check authentication first
  const session = await checkAuth(req)
  if (session instanceof NextResponse) return session

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const preferredLanguage = formData.get('preferredLanguage') as string
    const proofreadingContext = formData.get('proofreadingContext') as string

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Create job record with user info
    const { data: job, error: jobError } = await supabase
      .from('transcription_jobs')
      .insert({
        original_filename: file.name,
        preferred_language: preferredLanguage || null,
        proofreading_context: proofreadingContext || null,
        storage_path: `jobs/${Date.now()}-${file.name}`,
        user_id: session.user.id,
        metadata: {
          file_size: file.size,
          mime_type: file.type,
          user_email: session.user.email
        }
      })
      .select()
      .single()

    if (jobError) {
      throw jobError
    }

    // Upload file to storage with user-specific path
    const buffer = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('transcriptions')
      .upload(`${session.user.id}/${job.storage_path}/original`, buffer)

    if (uploadError) {
      throw uploadError
    }

    return NextResponse.json({
      jobId: job.id,
      status: 'accepted'
    })

  } catch (error) {
    console.error('Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

export async function GET(req: Request) {
  // Check authentication first
  const session = await checkAuth(req)
  if (session instanceof NextResponse) return session

  try {
    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get('jobId')

    if (!jobId) {
      return NextResponse.json(
        { error: 'No job ID provided' },
        { status: 400 }
      )
    }

    // Get job status (with user check)
    const { data: job, error: jobError } = await supabase
      .from('transcription_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', session.user.id) // Only allow access to user's own jobs
      .single()

    if (jobError) {
      throw jobError
    }

    // Get task counts
    const { data: tasks, error: tasksError } = await supabase
      .from('task_queue')
      .select('task_type, status')
      .eq('job_id', jobId)

    if (tasksError) {
      throw tasksError
    }

    // Calculate progress
    const progress = {
      totalSegments: job.segments_count || 0,
      completedTranscriptions: tasks.filter(
        t => t.task_type === 'TRANSCRIBE' && t.status === 'completed'
      ).length,
      completedProofreads: tasks.filter(
        t => t.task_type === 'PROOFREAD' && t.status === 'completed'
      ).length,
      currentPhase: getCurrentPhase(tasks)
    }

    return NextResponse.json({
      jobId,
      status: job.status,
      progress,
      result: job.final_proofread,
      error: job.error
    })

  } catch (error) {
    console.error('Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

function getCurrentPhase(tasks: any[]): string {
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'locked')
  if (pendingTasks.length === 0) return 'completed'

  const phases: Record<string, string> = {
    'SAVE_FILE': 'Saving file',
    'CONVERT_AUDIO': 'Converting audio',
    'SPLIT_AUDIO': 'Splitting audio',
    'TRANSCRIBE': 'Transcribing',
    'MERGE_TRANSCRIPTIONS': 'Merging transcriptions',
    'SPLIT_TEXT': 'Preparing for proofreading',
    'PROOFREAD': 'Proofreading',
    'MERGE_PROOFREADS': 'Finalizing',
    'CLEANUP': 'Cleaning up'
  }

  return phases[pendingTasks[0].task_type] || 'Processing'
} 