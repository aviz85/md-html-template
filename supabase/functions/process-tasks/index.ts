import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { processAudioSegment } from './audio-processor.ts'
import { transcribeAudio } from './whisper.ts'
import { proofreadText } from './gemini.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Task {
  id: string
  job_id: string
  task_type: string
  status: string
  input_data: Record<string, any>
  output_data: Record<string, any>
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Handle file upload and initial task creation
    if (req.method === 'POST') {
      const formData = await req.formData()
      const file = formData.get('file') as File
      const preferredLanguage = formData.get('preferredLanguage') as string
      const proofreadingContext = formData.get('proofreadingContext') as string

      if (!file) {
        return new Response(
          JSON.stringify({ error: 'No file provided' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      // Create job record
      const { data: job, error: jobError } = await supabase
        .from('transcription_jobs')
        .insert({
          original_filename: file.name,
          preferred_language: preferredLanguage || null,
          proofreading_context: proofreadingContext || null,
          storage_path: `jobs/${Date.now()}-${file.name}`,
          metadata: {
            file_size: file.size,
            mime_type: file.type
          }
        })
        .select()
        .single()

      if (jobError) {
        throw jobError
      }

      // Upload file to storage
      const buffer = await file.arrayBuffer()
      const { error: uploadError } = await supabase.storage
        .from('transcriptions')
        .upload(`${job.storage_path}/original`, buffer)

      if (uploadError) {
        throw uploadError
      }

      // Create initial SAVE_FILE task
      const { error: taskError } = await supabase
        .from('task_queue')
        .insert({
          job_id: job.id,
          task_type: 'SAVE_FILE',
          priority: 1,
          input_data: {
            filename: file.name,
            storage_path: job.storage_path
          }
        })

      if (taskError) {
        throw taskError
      }

      return new Response(
        JSON.stringify({
          jobId: job.id,
          status: 'accepted'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Handle status check
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const jobId = url.searchParams.get('jobId')

      if (!jobId) {
        return new Response(
          JSON.stringify({ error: 'No job ID provided' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      // Get job status
      const { data: job, error: jobError } = await supabase
        .from('transcription_jobs')
        .select('*')
        .eq('id', jobId)
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

      return new Response(
        JSON.stringify({
          jobId,
          status: job.status,
          progress,
          result: job.final_proofread,
          error: job.error
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process next pending task
    const { data: task, error: taskError } = await supabase
      .from('task_queue')
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (taskError || !task) {
      return new Response(
        JSON.stringify({ error: 'No pending tasks' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Lock the task
    const { error: lockError } = await supabase
      .from('task_queue')
      .update({
        status: 'locked',
        locked_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes lock
        locked_by: 'edge-function',
        started_at: new Date().toISOString()
      })
      .eq('id', task.id)

    if (lockError) {
      throw lockError
    }

    // Process task based on type
    let result
    switch (task.task_type) {
      case 'SAVE_FILE':
        // File is already saved during initial upload
        result = {
          storage_path: task.input_data.storage_path
        }
        break

      case 'CONVERT_AUDIO':
        result = await processAudioSegment(task.input_data)
        break

      case 'SPLIT_AUDIO':
        // Create multiple TRANSCRIBE tasks
        const segments = await processAudioSegment(task.input_data, true)
        for (const segment of segments) {
          await supabase.from('task_queue').insert({
            job_id: task.job_id,
            task_type: 'TRANSCRIBE',
            priority: task.priority,
            input_data: {
              segment_path: segment.path,
              segment_index: segment.index,
              total_segments: segments.length
            },
            parent_task_id: task.id,
            sequence_order: segment.index
          })
        }
        result = { segments_count: segments.length }
        break

      case 'TRANSCRIBE':
        result = await transcribeAudio(task.input_data)
        break

      case 'MERGE_TRANSCRIPTIONS':
        // Get all completed transcription tasks
        const { data: transcriptions } = await supabase
          .from('task_queue')
          .select('*')
          .eq('job_id', task.job_id)
          .eq('task_type', 'TRANSCRIBE')
          .eq('status', 'completed')
          .order('sequence_order', { ascending: true })

        result = {
          merged_text: transcriptions
            .map(t => t.output_data.text)
            .join('\n')
        }
        break

      case 'SPLIT_TEXT':
        const text = task.input_data.text
        const chunks = splitTextIntoChunks(text)
        for (const [index, chunk] of chunks.entries()) {
          await supabase.from('task_queue').insert({
            job_id: task.job_id,
            task_type: 'PROOFREAD',
            priority: task.priority,
            input_data: {
              text: chunk,
              chunk_index: index,
              total_chunks: chunks.length,
              context: task.input_data.context
            },
            parent_task_id: task.id,
            sequence_order: index
          })
        }
        result = { chunks_count: chunks.length }
        break

      case 'PROOFREAD':
        result = await proofreadText(task.input_data)
        break

      case 'MERGE_PROOFREADS':
        const { data: proofreads } = await supabase
          .from('task_queue')
          .select('*')
          .eq('job_id', task.job_id)
          .eq('task_type', 'PROOFREAD')
          .eq('status', 'completed')
          .order('sequence_order', { ascending: true })

        result = {
          final_text: proofreads
            .map(p => p.output_data.text)
            .join('\n')
        }
        break

      case 'CLEANUP':
        // Delete files from storage
        const { data: job } = await supabase
          .from('transcription_jobs')
          .select('storage_path')
          .eq('id', task.job_id)
          .single()

        if (job?.storage_path) {
          await supabase.storage
            .from('transcriptions')
            .remove([`${job.storage_path}/*`])
        }
        result = { cleaned: true }
        break
    }

    // Update task as completed
    await supabase
      .from('task_queue')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        output_data: result
      })
      .eq('id', task.id)

    // Create next task(s) based on task flow
    await createNextTasks(supabase, task)

    return new Response(
      JSON.stringify({ success: true, task_id: task.id, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

function splitTextIntoChunks(text: string, maxChunkSize = 1000): string[] {
  const chunks: string[] = []
  let currentChunk = ''
  const sentences = text.split(/(?<=[.!?])\s+/)

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxChunkSize) {
      chunks.push(currentChunk.trim())
      currentChunk = sentence
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim())
  }

  return chunks
}

async function createNextTasks(supabase: any, completedTask: Task) {
  const taskFlow: Record<string, string[]> = {
    'SAVE_FILE': ['CONVERT_AUDIO'],
    'CONVERT_AUDIO': ['SPLIT_AUDIO'],
    'SPLIT_AUDIO': [], // Creates TRANSCRIBE tasks directly
    'TRANSCRIBE': [], // All must complete before MERGE_TRANSCRIPTIONS
    'MERGE_TRANSCRIPTIONS': ['SPLIT_TEXT'],
    'SPLIT_TEXT': [], // Creates PROOFREAD tasks directly
    'PROOFREAD': [], // All must complete before MERGE_PROOFREADS
    'MERGE_PROOFREADS': ['CLEANUP']
  }

  const nextTaskTypes = taskFlow[completedTask.task_type] || []

  for (const nextType of nextTaskTypes) {
    await supabase.from('task_queue').insert({
      job_id: completedTask.job_id,
      task_type: nextType,
      priority: completedTask.priority,
      input_data: completedTask.output_data
    })
  }

  // Check if all sibling tasks are completed
  if (['TRANSCRIBE', 'PROOFREAD'].includes(completedTask.task_type)) {
    const { data: siblings } = await supabase
      .from('task_queue')
      .select('status')
      .eq('job_id', completedTask.job_id)
      .eq('task_type', completedTask.task_type)

    const allCompleted = siblings.every((s: any) => s.status === 'completed')

    if (allCompleted) {
      const mergeTask = completedTask.task_type === 'TRANSCRIBE' 
        ? 'MERGE_TRANSCRIPTIONS' 
        : 'MERGE_PROOFREADS'

      await supabase.from('task_queue').insert({
        job_id: completedTask.job_id,
        task_type: mergeTask,
        priority: completedTask.priority
      })
    }
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