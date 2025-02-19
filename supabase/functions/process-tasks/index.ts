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
      const contentType = req.headers.get('content-type') || ''
      
      // Handle file upload
      if (contentType.includes('multipart/form-data')) {
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

      // Parse JSON body once
      let body;
      try {
        body = await req.json();
      } catch (e) {
        return new Response(
          JSON.stringify({ error: 'Invalid JSON body' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Handle audio URL
      if (body.audioUrl) {
        // Create job record
        const { data: job, error: jobError } = await supabase
          .from('transcription_jobs')
          .insert({
            original_filename: body.audioUrl.split('/').pop(),
            preferred_language: body.preferredLanguage || null,
            proofreading_context: body.proofreadingContext || null,
            storage_path: `jobs/${Date.now()}-${body.audioUrl.split('/').pop()}`,
            metadata: {
              source_url: body.audioUrl
            }
          })
          .select()
          .single();

        if (jobError) {
          throw jobError;
        }

        // Create initial SAVE_FILE task
        const { error: taskError } = await supabase
          .from('task_queue')
          .insert({
            job_id: job.id,
            task_type: 'SAVE_FILE',
            priority: 1,
            input_data: {
              url: body.audioUrl,
              storage_path: job.storage_path
            }
          });

        if (taskError) {
          throw taskError;
        }

        return new Response(
          JSON.stringify({
            jobId: job.id,
            status: 'accepted'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Process next pending task
      if (!contentType.includes('application/json')) {
        return new Response(
          JSON.stringify({ error: 'Missing content type' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

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

      // Update job status to processing
      await supabase
        .from('transcription_jobs')
        .update({ status: 'processing' })
        .eq('id', task.job_id)

      // Process task based on type
      let result
      switch (task.task_type) {
        case 'SAVE_FILE':
          if (task.input_data.url) {
            // Download file from URL
            const response = await fetch(task.input_data.url);
            if (!response.ok) {
              throw new Error(`Failed to download file: ${response.statusText}`);
            }
            const buffer = await response.arrayBuffer();
            
            // Upload to storage
            const { error: uploadError } = await supabase.storage
              .from('transcriptions')
              .upload(`${task.input_data.storage_path}/original`, buffer);

            if (uploadError) {
              throw uploadError;
            }
          }
          
          result = {
            storage_path: task.input_data.storage_path
          };
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

          // Create PROOFREAD task directly instead of SPLIT_TEXT
          await supabase.from('task_queue').insert({
            job_id: task.job_id,
            task_type: 'PROOFREAD',
            priority: task.priority,
            input_data: {
              text: result.merged_text,
              chunk_index: 0,
              total_chunks: 1,
              context: task.input_data.context
            }
          })
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
          if (!task.input_data.text) {
            throw new Error('No text provided for proofreading')
          }
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

          // Update job with final result
          await supabase
            .from('transcription_jobs')
            .update({
              final_proofread: result.final_text,
              status: 'completed'
            })
            .eq('id', task.job_id)

          // Create cleanup task
          await supabase.from('task_queue').insert({
            job_id: task.job_id,
            task_type: 'CLEANUP',
            priority: 1,
            input_data: {
              storage_path: task.input_data.storage_path
            }
          })
          break

        case 'CLEANUP':
          // Delete files from storage
          const { data: job } = await supabase
            .from('transcription_jobs')
            .select('storage_path')
            .eq('id', task.job_id)
            .single()

          if (job?.storage_path) {
            // Delete all files in the folder
            await supabase.storage
              .from('transcriptions')
              .remove([`${job.storage_path}/*`])
              
            // Delete the folder itself
            await supabase.storage
              .from('transcriptions')
              .remove([job.storage_path])
          }
          
          // Update job status to completed
          await supabase
            .from('transcription_jobs')
            .update({
              status: 'completed'
            })
            .eq('id', task.job_id)
            
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
    'SAVE_FILE': ['TRANSCRIBE'],
    'CONVERT_AUDIO': [],
    'SPLIT_AUDIO': [],
    'TRANSCRIBE': [],
    'MERGE_TRANSCRIPTIONS': ['PROOFREAD'],
    'SPLIT_TEXT': [],
    'PROOFREAD': [],
    'MERGE_PROOFREADS': ['CLEANUP']
  }

  // Special handling for SAVE_FILE to create single TRANSCRIBE task
  if (completedTask.task_type === 'SAVE_FILE') {
    const inputData = {
      segment_path: `${completedTask.input_data.storage_path}/original`,
      preferred_language: completedTask.input_data.preferred_language,
      segment_index: 0,
      total_segments: 1
    }
    
    await supabase.from('task_queue').insert({
      job_id: completedTask.job_id,
      task_type: 'TRANSCRIBE',
      priority: 1,
      input_data: inputData
    })
    
    return // Don't continue to create more tasks
  }

  // For TRANSCRIBE tasks, check if all are completed to create MERGE_TRANSCRIPTIONS
  if (completedTask.task_type === 'TRANSCRIBE') {
    const { data: siblings } = await supabase
      .from('task_queue')
      .select('status')
      .eq('job_id', completedTask.job_id)
      .eq('task_type', 'TRANSCRIBE')

    const allCompleted = siblings.every((s: any) => s.status === 'completed')

    if (allCompleted) {
      // Get all completed transcriptions
      const { data: transcriptions } = await supabase
        .from('task_queue')
        .select('*')
        .eq('job_id', completedTask.job_id)
        .eq('task_type', 'TRANSCRIBE')
        .eq('status', 'completed')
        .order('sequence_order', { ascending: true })

      const mergedText = transcriptions
        .map((t: any) => t.output_data.text)
        .join('\n')

      await supabase.from('task_queue').insert({
        job_id: completedTask.job_id,
        task_type: 'MERGE_TRANSCRIPTIONS',
        priority: 1,
        input_data: {
          merged_text: mergedText,
          context: completedTask.input_data.context
        }
      })
    }
    return
  }

  // For MERGE_TRANSCRIPTIONS, create PROOFREAD task with proper data
  if (completedTask.task_type === 'MERGE_TRANSCRIPTIONS') {
    const text = completedTask.output_data.text
    if (!text) {
      throw new Error('No merged text available for proofreading')
    }
    
    await supabase.from('task_queue').insert({
      job_id: completedTask.job_id,
      task_type: 'PROOFREAD',
      priority: 1,
      input_data: {
        text,
        chunk_index: 0,
        total_chunks: 1,
        context: completedTask.input_data.context
      }
    })
    
    return // Don't continue to create more tasks
  }

  // For PROOFREAD tasks, check if all are completed to create MERGE_PROOFREADS
  if (completedTask.task_type === 'PROOFREAD') {
    const { data: siblings } = await supabase
      .from('task_queue')
      .select('status')
      .eq('job_id', completedTask.job_id)
      .eq('task_type', 'PROOFREAD')

    const allCompleted = siblings.every((s: any) => s.status === 'completed')

    if (allCompleted) {
      const { data: proofreads } = await supabase
        .from('task_queue')
        .select('*')
        .eq('job_id', completedTask.job_id)
        .eq('task_type', 'PROOFREAD')
        .eq('status', 'completed')
        .order('sequence_order', { ascending: true })

      const finalText = proofreads
        .map((p: any) => p.output_data.text)
        .join('\n')

      await supabase.from('task_queue').insert({
        job_id: completedTask.job_id,
        task_type: 'MERGE_PROOFREADS',
        priority: 1,
        input_data: {
          final_text: finalText,
          context: completedTask.input_data.context
        }
      })
    }
    return
  }

  if (completedTask.task_type === 'MERGE_PROOFREADS') {
    // Update job with final result
    await supabase
      .from('transcription_jobs')
      .update({
        final_proofread: completedTask.output_data.final_text,
        status: 'completed'
      })
      .eq('id', completedTask.job_id)

    // Create cleanup task
    await supabase.from('task_queue').insert({
      job_id: completedTask.job_id,
      task_type: 'CLEANUP',
      priority: 1,
      input_data: {
        storage_path: completedTask.input_data.storage_path
      }
    })
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