import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Find stuck tasks
    const { data: stuckTasks, error: findError } = await supabase
      .from('task_queue')
      .select('*')
      .eq('status', 'locked')
      .lt('locked_until', new Date().toISOString())

    if (findError) {
      throw findError
    }

    const results = []

    // Process each stuck task
    for (const task of stuckTasks) {
      if (task.retry_count >= task.max_retries) {
        // Mark as failed
        const { error: failError } = await supabase
          .from('task_queue')
          .update({
            status: 'failed',
            error: 'Max retries exceeded',
            completed_at: new Date().toISOString()
          })
          .eq('id', task.id)

        if (failError) {
          console.error(`Failed to mark task ${task.id} as failed:`, failError)
          continue
        }

        // Update job status if needed
        await updateJobStatus(supabase, task.job_id)
        
        results.push({
          task_id: task.id,
          action: 'marked_failed',
          reason: 'max_retries_exceeded'
        })
      } else {
        // Reset for retry
        const { error: resetError } = await supabase
          .from('task_queue')
          .update({
            status: 'pending',
            retry_count: task.retry_count + 1,
            locked_until: null,
            locked_by: null,
            error: null
          })
          .eq('id', task.id)

        if (resetError) {
          console.error(`Failed to reset task ${task.id}:`, resetError)
          continue
        }

        results.push({
          task_id: task.id,
          action: 'reset_for_retry',
          retry_count: task.retry_count + 1
        })
      }
    }

    return new Response(
      JSON.stringify({
        processed: stuckTasks.length,
        results
      }),
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

async function updateJobStatus(supabase: any, jobId: string) {
  // Get all tasks for this job
  const { data: tasks, error: tasksError } = await supabase
    .from('task_queue')
    .select('status')
    .eq('job_id', jobId)

  if (tasksError) {
    console.error(`Failed to get tasks for job ${jobId}:`, tasksError)
    return
  }

  // Check if all tasks are completed or failed
  const allDone = tasks.every((t: any) => 
    t.status === 'completed' || t.status === 'failed'
  )

  if (allDone) {
    const hasFailed = tasks.some((t: any) => t.status === 'failed')
    
    await supabase
      .from('transcription_jobs')
      .update({
        status: hasFailed ? 'failed' : 'completed',
        error: hasFailed ? 'One or more tasks failed' : null
      })
      .eq('id', jobId)
  }
} 