import { NextResponse } from 'next/server';
import { processSubmission } from '@/lib/claude';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Add type for form data
interface FormData {
  formID?: string;
  submissionID?: string;
  submission_id?: string;
  parsedRequest?: any;
  pretty?: string;
  transcriptions?: Array<{
    fieldName: string;
    path: string;
    questionLabel?: string;
    transcription: string;
  }>;
  transcription_errors?: Array<{
    fieldName: string;
    path: string;
    error: string;
  }>;
  [key: string]: any;
}

// Helper to find audio files in form data
function findAudioFiles(obj: any): { path: string; fieldName: string; questionLabel?: string }[] {
  const audioFiles: { path: string; fieldName: string; questionLabel?: string }[] = [];
  
  // Extract question labels from pretty field
  const questionMap = new Map<string, string>();
  if (obj.pretty) {
    const pairs = obj.pretty.split(', ');
    pairs.forEach((pair: string) => {
      const [question, value] = pair.split(':');
      if (value && (value.includes('/widget-uploads/voiceRecorder/') || value.includes('.mp3'))) {
        questionMap.set(value, question);
      }
    });
  }
  
  function traverse(current: any, path: string[] = []) {
    if (typeof current === 'string') {
      // Check for voice recorder widget uploads and add prefix if needed
      if (current.includes('/widget-uploads/voiceRecorder/')) {
        const fullPath = current.startsWith('/') ? 
          `https://www.jotform.com${current}` : 
          `https://www.jotform.com/${current}`;
        
        audioFiles.push({ 
          path: fullPath,
          fieldName: path.join('.'),
          questionLabel: questionMap.get(current)
        });
      }
      // Check for regular mp3 uploads
      else if (current.includes('.mp3') || current.includes('.mp4') || current.includes('.wav')) {
        // If it's already a full URL, use it as is
        const fullPath = current.startsWith('http') ? 
          current : 
          `https://www.jotform.com/${current.startsWith('/') ? current.slice(1) : current}`;
        
        audioFiles.push({
          path: fullPath,
          fieldName: path.join('.'),
          questionLabel: questionMap.get(current)
        });
      }
    } else if (typeof current === 'object' && current !== null) {
      Object.entries(current).forEach(([key, value]) => {
        traverse(value, [...path, key]);
      });
    }
  }

  traverse(obj);
  
  // Log found audio files with their full paths
  console.log('[Audio Files] Found files:', audioFiles.map(f => ({
    ...f,
    originalPath: f.path,
    hasPrefix: f.path.startsWith('https://www.jotform.com')
  })));

  return audioFiles;
}

// Helper to transcribe audio and wait for completion
async function transcribeAudio(audioUrl: string): Promise<string> {
  console.log(`[Transcription] Starting transcription for: ${audioUrl}`);
  
  // Call edge function with the URL directly
  console.log('[Transcription] Calling process-tasks function with URL...');
  const response = await fetch('https://fdecrxcxrshebgrmbywz.supabase.co/functions/v1/process-tasks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: audioUrl,
      preferredLanguage: 'he'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Transcription] Failed to start transcription. Status: ${response.status}, Error: ${errorText}`);
    throw new Error(`Failed to start transcription: ${response.statusText} - ${errorText}`);
  }

  const responseData = await response.json();
  console.log('[Transcription] Process-tasks response:', responseData);

  if (!responseData.jobId) {
    console.error('[Transcription] No jobId returned from process-tasks:', responseData);
    throw new Error('No jobId returned from transcription service');
  }

  const jobId = responseData.jobId;
  console.log(`[Transcription] Job started successfully. JobID: ${jobId}`);

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max (with 5 second delay)
  
  while (attempts < maxAttempts) {
    attempts++;
    console.log(`[Transcription] Checking status for jobId ${jobId} (attempt ${attempts}/${maxAttempts})`);
    
    const statusResponse = await fetch(
      `https://fdecrxcxrshebgrmbywz.supabase.co/functions/v1/process-tasks?jobId=${jobId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      console.error(`[Transcription] Status check failed. Status: ${statusResponse.status}, Error: ${errorText}`);
      throw new Error(`Failed to check transcription status: ${statusResponse.statusText} - ${errorText}`);
    }

    const status = await statusResponse.json();
    console.log(`[Transcription] Job ${jobId} status:`, status);
    
    if (status.status === 'completed' && status.result) {
      console.log(`[Transcription] Job ${jobId} completed successfully. Text length: ${status.result.length}`);
      return status.result;
    }

    if (status.status === 'failed') {
      console.error(`[Transcription] Job ${jobId} failed:`, status.error);
      throw new Error(`Transcription failed: ${status.error}`);
    }

    if (attempts === maxAttempts) {
      throw new Error(`Transcription timed out after ${maxAttempts} attempts`);
    }

    console.log(`[Transcription] Job ${jobId} still processing. Waiting 5 seconds before next check...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  throw new Error('Transcription failed: Max attempts reached');
}

// Add parseRequestBody function
async function parseRequestBody(request: Request): Promise<FormData> {
  const contentType = request.headers.get('content-type') || '';
  console.log('[JotForm Webhook] Content-Type:', contentType);
  
  let formData: FormData = {};
  
  if (contentType.includes('application/json')) {
    const rawBody = await request.text();
    console.log('[JotForm Webhook] Raw request body length:', rawBody.length);
    console.log('[JotForm Webhook] Raw request body preview:', rawBody.substring(0, 500));
    formData = JSON.parse(rawBody);
    
    if (formData.rawRequest) {
      try {
        console.log('[JotForm Webhook] Attempting to parse rawRequest...');
        formData.parsedRequest = JSON.parse(formData.rawRequest);
        console.log('[JotForm Webhook] Successfully parsed rawRequest');
      } catch (e) {
        console.error('[JotForm Webhook] Failed to parse rawRequest:', e);
        formData.parsedRequest = formData.rawRequest;
      }
    }
  } else if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
    const formDataObj = await request.formData();
    formData = Object.fromEntries(formDataObj.entries()) as FormData;
    
    if (formData.rawRequest) {
      try {
        console.log('[JotForm Webhook] Attempting to parse rawRequest from form data...');
        formData.parsedRequest = JSON.parse(formData.rawRequest as string);
        console.log('[JotForm Webhook] Successfully parsed rawRequest from form data');
      } catch (e) {
        console.error('[JotForm Webhook] Failed to parse rawRequest from form data:', e);
        formData.parsedRequest = formData.rawRequest;
      }
    }
  }

  return formData;
}

// Add triggerProcessWithRetry function
async function triggerProcessWithRetry(submission: any, retryCount = 0, maxRetries = 5) {
  try {
    // Use the base URL from the environment or default to the production URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://md-html-template.vercel.app';
    const processUrl = `${baseUrl}/api/process`;
    
    console.log('[Process] Triggering process:', {
      url: processUrl,
      baseUrl,
      attempt: retryCount + 1,
      submissionId: submission.submission_id
    });

    const response = await fetch(processUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        submissionId: submission.submission_id,
        _timestamp: Date.now()
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('[Process] Error in background processing:', error.message);
      if (retryCount < maxRetries) {
        const delay = Math.min(5000 * Math.pow(2, retryCount), 80000);
        await new Promise(resolve => setTimeout(resolve, delay));
        return triggerProcessWithRetry(submission, retryCount + 1, maxRetries);
      }
    }
    throw error;
  }
}

export const runtime = 'nodejs';
export const maxDuration = 300; // Increase timeout to 5 minutes to handle transcriptions

export async function POST(request: Request) {
  try {
    console.log('[JotForm Webhook] Starting to process request...');
    
    // Parse the request body
    const formData = await parseRequestBody(request);

    // Find audio files first
    const audioFiles = findAudioFiles(formData.parsedRequest || formData);
    console.log('[JotForm Webhook] Found audio files:', JSON.stringify(audioFiles, null, 2));

    // Handle transcriptions first
    if (audioFiles.length > 0) {
      console.log('[JotForm Webhook] Processing audio files before continuing...');
      
      // Create initial submission record with pending status
      const { data: initialSubmission, error: submissionError } = await supabaseAdmin
        .from('form_submissions')
        .insert({
          form_id: formData.formID || '250194606110042',
          submission_id: formData.submissionID || formData.submission_id || 'test123',
          content: {
            ...formData,
            has_audio: true,
            audio_count: audioFiles.length,
            transcription_status: 'pending',
            original_audio_files: audioFiles
          },
          status: 'transcribing',
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (submissionError) {
        console.error('[JotForm Webhook] Error creating submission:', submissionError);
        return NextResponse.json({ error: submissionError.message }, { status: 500 });
      }

      // Process each audio file
      for (const { path, fieldName, questionLabel } of audioFiles) {
        try {
          console.log(`[JotForm Webhook] Transcribing audio for field: ${fieldName}`);
          const transcription = await transcribeAudio(path);
          
          // Update form data with transcription
          updateFormDataWithTranscription(formData, {
            fieldName,
            transcription,
            questionLabel,
            path
          });

          // Update submission record with progress
          const { error: updateError } = await supabaseAdmin
            .from('form_submissions')
            .update({
              content: {
                ...formData,
                transcription_status: 'in_progress',
                transcriptions: [
                  ...(formData.transcriptions || []),
                  { fieldName, path, questionLabel, transcription }
                ]
              },
              updated_at: new Date().toISOString()
            })
            .eq('submission_id', initialSubmission.submission_id);

          if (updateError) {
            console.error('[JotForm Webhook] Error updating submission:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
          }

        } catch (error: unknown) {
          console.error(`[JotForm Webhook] Transcription failed for ${path}:`, error);
          // Update submission with error for this audio file
          const errorMessage = error instanceof Error ? 
            error.message : 
            'Unknown transcription error';

          const { error: updateError } = await supabaseAdmin
            .from('form_submissions')
            .update({
              content: {
                ...formData,
                transcription_status: 'partial',
                transcription_errors: [
                  ...(formData.transcription_errors || []),
                  { fieldName, path, error: errorMessage }
                ]
              },
              updated_at: new Date().toISOString()
            })
            .eq('submission_id', initialSubmission.submission_id);

          if (updateError) {
            console.error('[JotForm Webhook] Error updating submission with error:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
          }
        }
      }

      // Update final submission with all transcriptions
      const { data: submission } = await supabaseAdmin
        .from('form_submissions')
        .update({
          content: {
            ...formData,
            transcription_status: 'completed',
            has_audio: true,
            audio_count: audioFiles.length
          },
          status: 'pending_processing', // Ready for next stage
          updated_at: new Date().toISOString()
        })
        .eq('submission_id', initialSubmission.submission_id)
        .select()
        .single();

      // Continue with the rest of the processing...
      triggerProcessWithRetry(submission).catch(error => {
        console.error('[Process] Error in background processing:', error);
      });

      return NextResponse.json({
        message: 'Submission received and transcribed, processing started',
        submissionId: submission.submission_id,
        transcriptions: formData.transcriptions,
        links: {
          status: `/api/submission/status?id=${submission.submission_id}`,
          results: `/results?s=${submission.submission_id}`
        }
      });
    }

    // If no audio files, proceed with normal processing...
    // Rest of your existing code...
  } catch (error) {
    console.error('[JotForm Webhook] Error processing webhook:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { 
      status: 500 
    });
  }
}

// Helper function to update form data with transcription
function updateFormDataWithTranscription(formData: any, {
  fieldName,
  transcription,
  questionLabel,
  path
}: {
  fieldName: string;
  transcription: string;
  questionLabel?: string;
  path: string;
}) {
  // Update in parsedRequest
  if (formData.parsedRequest) {
    const keys = fieldName.split('.');
    let current = formData.parsedRequest;
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = transcription;
  }

  // Update in main formData
  formData[fieldName] = transcription;
  
  // Update in q73_input73 style fields
  const shortFieldName = fieldName.split('.').pop();
  if (shortFieldName && formData[`q${shortFieldName}`]) {
    formData[`q${shortFieldName}`] = transcription;
  }
  
  // Update pretty field
  if (formData.pretty && questionLabel) {
    formData.pretty = formData.pretty.replace(
      `${questionLabel}:${path}`,
      `${questionLabel}:${transcription}`
    );
  }

  // Store transcription in array
  formData.transcriptions = [
    ...(formData.transcriptions || []),
    { fieldName, path, questionLabel, transcription }
  ];
}

export async function GET(request: Request) {
  try {
    console.log('[JotForm Results] Processing GET request');
    const { searchParams } = new URL(request.url);
    const formId = searchParams.get('formId');
    
    if (!formId) {
      console.log('[JotForm Results] Missing formId parameter');
      return NextResponse.json(
        { error: 'formId is required' },
        { status: 400 }
      );
    }

    console.log(`[JotForm Results] Fetching submissions for form: ${formId}`);
    // Get submissions for this form only
    const { data: submissions, error } = await supabaseAdmin
      .from('form_submissions')
      .select('*')
      .eq('form_id', formId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[JotForm Results] Error fetching submissions:', error);
      throw error;
    }

    console.log(`[JotForm Results] Successfully fetched ${submissions?.length || 0} submissions`);

    // Process and enrich the submissions data
    const enrichedSubmissions = submissions?.map(sub => ({
      ...sub,
      processing_status: {
        status: sub.status,
        stage: sub.stage || sub.progress?.stage,
        last_update: sub.updated_at,
        duration: sub.updated_at ? 
          Math.round((new Date(sub.updated_at).getTime() - new Date(sub.created_at).getTime()) / 1000) : 
          null,
        error: sub.error || sub.progress?.details?.error,
        current_message: sub.message || sub.progress?.message,
      },
      audio_files: sub.content?.transcriptions || [],
      has_audio: sub.has_audio || sub.content && Object.values(sub.content).some(
        (val: any) => typeof val === 'string' && 
          (val.includes('/widget-uploads/voiceRecorder/') || val.includes('.mp3'))
      ),
      has_transcription: sub.transcription_status === 'completed' || sub.content?.transcriptions?.some(
        (t: any) => t.transcription && t.transcription.length > 0
      ),
      transcriptions: (sub.content?.transcriptions || []).map((t: any) => ({
        ...t,
        question: t.questionLabel,
        field: t.fieldName,
        audio_url: t.path,
        text: t.transcription
      })),
      latest_log: sub.logs ? sub.logs[sub.logs.length - 1] : null,
    }));

    console.log(`[JotForm Results] Successfully processed ${enrichedSubmissions?.length || 0} submissions with details`);
    
    // Log some stats about the submissions
    const stats = {
      total: enrichedSubmissions?.length || 0,
      pending: enrichedSubmissions?.filter(s => s.status === 'pending').length || 0,
      completed: enrichedSubmissions?.filter(s => s.status === 'completed').length || 0,
      failed: enrichedSubmissions?.filter(s => s.status === 'error').length || 0,
      with_audio: enrichedSubmissions?.filter(s => s.has_audio).length || 0,
      with_transcription: enrichedSubmissions?.filter(s => s.has_transcription).length || 0,
      transcription_status: {
        none: enrichedSubmissions?.filter(s => !s.has_audio).length || 0,
        pending: enrichedSubmissions?.filter(s => s.has_audio && !s.has_transcription).length || 0,
        completed: enrichedSubmissions?.filter(s => s.has_transcription).length || 0,
        failed: enrichedSubmissions?.filter(s => s.has_audio && s.transcription_status === 'failed').length || 0
      }
    };

    return NextResponse.json(enrichedSubmissions);
  } catch (error) {
    console.error('[JotForm Results] Error in GET request:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 