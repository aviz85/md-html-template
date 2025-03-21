import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { proofreadText } from './gemini.ts'

// Helper function to split text into manageable chunks
function splitTextIntoChunks(text: string, maxChunkLength = 1000): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxChunkLength && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    currentChunk += (currentChunk ? ' ' : '') + sentence;
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

function isMP3(url: string): boolean {
  return url.toLowerCase().endsWith('.mp3');
}

// New function to claim a task with proper locking
async function claimNextPendingTask(supabase: any, workerId: string) {
  // Create a 30-second lock window
  const lockTime = new Date();
  lockTime.setSeconds(lockTime.getSeconds() + 30);
  const lockTimeStr = lockTime.toISOString();
  
  // Use a transaction to safely claim a task
  const { data, error } = await supabase.rpc('claim_next_pending_task', {
    worker_id: workerId,
    lock_until: lockTimeStr
  });
  
  if (error || !data) {
    console.log('No pending tasks found or error claiming task:', error);
    return null;
  }
  
  return data;
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

    // Process general task queue requests
    if (req.method === 'POST') {
      const body = await req.json();
      
      // Check if this is a worker claiming a task
      if (body.worker_id) {
        const workerId = body.worker_id;
        console.log(`Worker ${workerId} claiming next task`);
        
        // Claim next task with locking
        const task = await claimNextPendingTask(supabase, workerId);
        
        if (!task) {
          return new Response(
            JSON.stringify({ message: 'No pending tasks available' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Process the task based on its type
        // This is where you'd implement the specific task processing logic
        // For now just returning that we claimed it
        return new Response(
          JSON.stringify({ 
            message: 'Task claimed successfully',
            task_id: task.id,
            task_type: task.task_type
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Handle transcription request with URL
      const { url, preferredLanguage } = body;
      
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

      // Convert audio if not MP3
      let processUrl = url;
      if (!isMP3(url)) {
        console.log('Converting audio to MP3 format...');
        const convertResponse = await fetch(`${Deno.env.get('APP_URL')}/api/convert`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({ url })
        });

        if (!convertResponse.ok) {
          const error = await convertResponse.text();
          throw new Error(`Conversion failed: ${error}`);
        }

        const { convertedUrl } = await convertResponse.json();
        processUrl = convertedUrl;
        
        // Update job with conversion info
        await supabase
          .from('transcription_jobs')
          .update({
            metadata: {
              ...job.metadata,
              converted_url: convertedUrl,
              original_url: url
            }
          })
          .eq('id', job.id);
      }

      // Download and save file
      const response = await fetch(processUrl)
      if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`)
      
      const buffer = await response.arrayBuffer()
      const { error: uploadError } = await supabase.storage
        .from('transcriptions')
        .upload(`${job.storage_path}/original`, buffer, {
          contentType: 'audio/mpeg'
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
      formData.append('model', 'whisper-large-v3')
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

      let finalText = transcription.text;
      let hasProofread = false;

      // Default proofread to true unless explicitly disabled
      const shouldProofread = job.metadata?.disable_proofread !== true;

      // Try proofreading if enabled
      if (shouldProofread) {
        try {
          // Split text for proofreading
          const chunks = splitTextIntoChunks(transcription.text);
          const proofreadChunks = [];

          // Proofread each chunk
          for (let i = 0; i < chunks.length; i++) {
            const proofreadResult = await proofreadText({
              text: chunks[i],
              chunk_index: i,
              total_chunks: chunks.length,
              context: job.proofreading_context || undefined
            });
            proofreadChunks.push(proofreadResult.text);
          }

          // Merge proofread chunks
          finalText = proofreadChunks.join('\n\n');
          hasProofread = true;
        } catch (proofreadError) {
          console.error('Proofreading failed:', proofreadError);
          // Continue with original transcription if proofreading fails
          finalText = transcription.text;
        }
      }

      // Update job with results - always save both versions
      await supabase
        .from('transcription_jobs')
        .update({
          status: 'completed',
          final_transcription: transcription.text,
          final_proofread: hasProofread ? finalText : null,
          metadata: {
            ...job.metadata,
            proofread_attempted: shouldProofread,
            proofread_succeeded: hasProofread
          }
        })
        .eq('id', job.id)

      // Mark task as completed
      await supabase
        .from('task_queue')
        .update({
          status: 'completed',
          output_data: {
            text: transcription.text,
            proofread_text: hasProofread ? finalText : null,
            language: transcription.language,
            proofread_attempted: shouldProofread,
            proofread_succeeded: hasProofread
          }
        })
        .eq('id', task.id)

      return new Response(
        JSON.stringify({ 
          jobId: job.id, 
          status: 'processing',
          result: finalText, // For backward compatibility
          hasProofread,
          proofreadAttempted: shouldProofread
        }),
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
          result: job.final_proofread || job.final_transcription, // Always return best available version
          transcription: job.final_transcription,
          proofread: job.final_proofread,
          metadata: {
            proofread_attempted: job.metadata?.proofread_attempted,
            proofread_succeeded: job.metadata?.proofread_succeeded
          },
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