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

    // Handle POST request for new transcription
    if (req.method === 'POST') {
      const { url, preferredLanguage } = await req.json()
      
      if (!url) {
        return new Response(
          JSON.stringify({ error: 'No URL provided' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      // Create job
      const { data: job, error: jobError } = await supabase
        .from('transcription_jobs')
        .insert({
          original_filename: url.split('/').pop(),
          status: 'processing',
          preferred_language: preferredLanguage,
          storage_path: `jobs/${Date.now()}-${url.split('/').pop()}`,
          metadata: { source_url: url }
        })
        .select()
        .single()

      if (jobError) throw jobError

      // Download and save file
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`)
      
      const buffer = await response.arrayBuffer()
      const { error: uploadError } = await supabase.storage
        .from('transcriptions')
        .upload(`${job.storage_path}/original`, buffer, {
          contentType: response.headers.get('content-type') || 'audio/wav'
        })

      if (uploadError) throw uploadError

      // Create transcription task and process it immediately
      const { data: task } = await supabase.from('task_queue').insert({
        job_id: job.id,
        task_type: 'TRANSCRIBE',
        status: 'pending',
        input_data: {
          segment_path: `${job.storage_path}/original`,
          preferred_language: preferredLanguage
        }
      }).select().single()

      // Call Groq API for transcription
      const formData = new FormData()
      formData.append('file', new Blob([buffer]), 'audio.mp3')
      formData.append('model', 'whisper-large-v3-turbo')
      formData.append('response_format', 'verbose_json')

      if (preferredLanguage) {
        formData.append('language', preferredLanguage)
      }

      const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('GROQ_API_KEY')}`
        },
        body: formData
      })

      if (!groqResponse.ok) {
        const error = await groqResponse.text()
        throw new Error(`Groq API error: ${error}`)
      }

      const transcription = await groqResponse.json()

      // Update job with transcription result
      await supabase
        .from('transcription_jobs')
        .update({
          status: 'completed',
          final_proofread: transcription.text
        })
        .eq('id', job.id)

      // Mark task as completed
      await supabase
        .from('task_queue')
        .update({
          status: 'completed',
          output_data: {
            text: transcription.text,
            language: transcription.language
          }
        })
        .eq('id', task.id)

      return new Response(
        JSON.stringify({ jobId: job.id, status: 'processing' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Handle GET request for status check
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const jobId = url.searchParams.get('jobId')

      if (!jobId) {
        return new Response(
          JSON.stringify({ error: 'No job ID provided' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      const { data: job } = await supabase
        .from('transcription_jobs')
        .select('*')
        .eq('id', jobId)
        .single()

      return new Response(
        JSON.stringify({
          jobId,
          status: job.status,
          result: job.final_proofread,
          error: job.error
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
}) 