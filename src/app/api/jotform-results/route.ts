import { NextResponse } from 'next/server';
import { processSubmission } from '@/lib/claude';
import { supabaseAdmin } from '@/lib/supabase-admin';

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
      // Check for voice recorder widget uploads
      if (current.includes('/widget-uploads/voiceRecorder/')) {
        audioFiles.push({ 
          path: current,
          fieldName: path.join('.'),
          questionLabel: questionMap.get(current)
        });
      }
      // Check for regular mp3 uploads
      if (current.includes('.mp3')) {
        audioFiles.push({
          path: current,
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
      audioUrl,
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
    
    try {
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
      
      if (status.status === 'completed' && status.text) {
        console.log(`[Transcription] Job ${jobId} completed successfully. Text length: ${status.text.length}`);
        return status.text;
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
    } catch (error) {
      if (error instanceof Error && error.message.includes('invalid input syntax for type uuid')) {
        console.error(`[Transcription] Invalid jobId format:`, { jobId, error: error.message });
        throw new Error('Invalid transcription job ID returned from service');
      }
      throw error;
    }
  }
  
  throw new Error('Transcription failed: Max attempts reached');
}

export const runtime = 'nodejs';
export const maxDuration = 300; // Increase timeout to 5 minutes to handle transcriptions

export async function POST(request: Request) {
  try {
    console.log('[JotForm Webhook] Starting to process request...');
    
    // Get content type
    const contentType = request.headers.get('content-type') || '';
    console.log('[JotForm Webhook] Content-Type:', contentType);
    
    // Parse the body based on content type
    let formData: any = {};
    let rawBody = '';
    
    if (contentType.includes('application/json')) {
      rawBody = await request.text();
      console.log('[JotForm Webhook] Raw request body length:', rawBody.length);
      console.log('[JotForm Webhook] Raw request body preview:', rawBody.substring(0, 500));
      formData = JSON.parse(rawBody);
      console.log('[JotForm Webhook] Parsed form data keys:', Object.keys(formData));
      
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
      formData = Object.fromEntries(formDataObj.entries());
      console.log('[JotForm Webhook] Form data keys after parsing:', Object.keys(formData));
      
      if (formData.rawRequest) {
        try {
          console.log('[JotForm Webhook] Attempting to parse rawRequest from form data...');
          formData.parsedRequest = JSON.parse(formData.rawRequest);
          console.log('[JotForm Webhook] Successfully parsed rawRequest from form data');
        } catch (e) {
          console.error('[JotForm Webhook] Failed to parse rawRequest from form data:', e);
          formData.parsedRequest = formData.rawRequest;
        }
      }
    }

    // Find and transcribe audio files
    const audioFiles = findAudioFiles(formData.parsedRequest || formData);
    console.log('[JotForm Webhook] Found audio files:', JSON.stringify(audioFiles, null, 2));

    for (const { path, fieldName, questionLabel } of audioFiles) {
      try {
        console.log(`[JotForm Webhook] Starting transcription for field: ${fieldName}, path: ${path}`);
        const transcription = await transcribeAudio(path);
        
        console.log(`[JotForm Webhook] Transcription completed for ${fieldName}. Length: ${transcription.length}`);
        
        // Replace the audio file path with the transcription everywhere it appears
        if (formData.parsedRequest) {
          // Update in parsedRequest
          const keys = fieldName.split('.');
          let current = formData.parsedRequest;
          for (let i = 0; i < keys.length - 1; i++) {
            current = current[keys[i]];
          }
          current[keys[keys.length - 1]] = transcription;
          console.log(`[JotForm Webhook] Updated parsedRequest with transcription for ${fieldName}`);
        }

        // Update in main formData
        formData[fieldName] = transcription;
        
        // Update in q73_input73 style fields if they exist
        const shortFieldName = fieldName.split('.').pop();
        if (shortFieldName && formData[`q${shortFieldName}`]) {
          formData[`q${shortFieldName}`] = transcription;
        }
        
        // Update pretty field by replacing the audio path with the transcription
        if (formData.pretty) {
          const oldPretty = formData.pretty;
          // First try exact match with the path
          let newPretty = formData.pretty.replace(
            `${questionLabel}:${path}`,
            `${questionLabel}:${transcription}`
          );
          
          // If no change, try finding the question label and replacing everything after it until the next comma
          if (newPretty === oldPretty && questionLabel) {
            const parts = oldPretty.split(', ');
            const updatedParts = parts.map((part: string) => {
              if (part.startsWith(`${questionLabel}:`)) {
                return `${questionLabel}:${transcription}`;
              }
              return part;
            });
            newPretty = updatedParts.join(', ');
          }
          
          formData.pretty = newPretty;
          console.log(`[JotForm Webhook] Updated pretty field:`, {
            changed: oldPretty !== newPretty,
            questionLabel,
            transcriptionPreview: transcription.substring(0, 50)
          });
        }
        
        console.log(`[JotForm Webhook] Successfully processed transcription for ${fieldName}`);
      } catch (error) {
        console.error(`[JotForm Webhook] Failed to transcribe ${path}:`, error);
        // Continue with other files even if one fails
      }
    }

    console.log('[JotForm Webhook] About to save submission:', {
      form_id: formData.formID || '250194606110042',
      submission_id: formData.submissionID || formData.submission_id || 'test123',
      content_keys: Object.keys(formData)
    });

    // Save to database first
    console.log('[JotForm Webhook] Inserting submission into database...');
    
    // Clean up the form data to ensure transcriptions are saved as regular answers
    const cleanedFormData = {
      ...formData,
      parsedRequest: formData.parsedRequest || undefined
    };

    // Ensure transcriptions are saved in their original field locations
    audioFiles.forEach(({ fieldName, path }) => {
      if (formData[fieldName] && !formData[fieldName].includes('/widget-uploads/')) {
        // If the field has been transcribed, use that value
        cleanedFormData[fieldName] = formData[fieldName];
        
        // Also update in q73_input73 style fields if they exist
        const shortFieldName = fieldName.split('.').pop();
        if (shortFieldName && formData[`q${shortFieldName}`]) {
          cleanedFormData[`q${shortFieldName}`] = formData[fieldName];
        }
      }
    });

    const { data: submission, error: submissionError } = await supabaseAdmin
      .from('form_submissions')
      .insert({
        form_id: formData.formID || '250194606110042',
        submission_id: formData.submissionID || formData.submission_id || 'test123',
        content: {
          ...cleanedFormData,
          // Keep original audio paths in a separate field
          original_audio_files: audioFiles.map(({ path, fieldName, questionLabel }) => ({
            path,
            fieldName,
            questionLabel
          })),
          // Store transcriptions both in their original fields and in a dedicated array
          transcriptions: audioFiles.map(({ path, fieldName, questionLabel }) => ({
            path,
            fieldName,
            questionLabel,
            transcription: formData[fieldName]
          })).filter(t => t.transcription && !t.transcription.includes('/widget-uploads/'))
        },
        has_audio: audioFiles.length > 0,
        audio_count: audioFiles.length,
        transcription_status: audioFiles.length > 0 ? 'completed' : 'none',
        status: 'pending',
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (submissionError) {
      console.error('[JotForm Webhook] Error saving submission:', submissionError);
      throw submissionError;
    }

    // Log transcription details
    console.log('[JotForm Webhook] Transcription details:', {
      audioFiles: audioFiles.length,
      transcriptions: audioFiles.map(({ path, fieldName }) => ({
        path,
        fieldName,
        hasTranscription: !!formData[fieldName],
        transcriptionLength: formData[fieldName]?.length || 0
      }))
    });

    console.log('[JotForm Webhook] Submission saved successfully:', {
      id: submission.id,
      submission_id: submission.submission_id,
      status: submission.status,
      has_audio: submission.has_audio,
      audio_count: submission.audio_count,
      transcription_status: submission.transcription_status
    });

    // Start processing in background with retry mechanism
    const triggerProcessWithRetry = async (retryCount = 0, maxRetries = 5) => {
      try {
        const requestUrl = new URL(request.url);
        const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
        const processUrl = `${baseUrl}/api/process`;
        
        console.log('[Process] Triggering process:', {
          url: processUrl,
          attempt: retryCount + 1,
          submissionId: submission.submission_id
        });

        const response = await fetch(processUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Connection': 'keep-alive'
          },
          body: JSON.stringify({ 
            submissionId: submission.submission_id,
            _timestamp: Date.now()
          }),
          signal: AbortSignal.timeout(300000)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        }

        console.log('[Process] Process request sent successfully:', {
          submissionId: submission.submission_id,
          status: response.status
        });
      } catch (error) {
        const e = error as Error;
        console.error(`[Process] Background process request failed (attempt ${retryCount + 1}):`, {
          error: e.message,
          cause: (e as Error & { cause?: { message?: string } }).cause?.message,
          stack: e.stack
        });
        
        // Check if error is retryable
        const shouldRetry = (err: Error) => {
          const retryableErrors = [
            'ECONNRESET',
            'ETIMEDOUT',
            'ECONNREFUSED',
            'socket disconnected',
            'network socket',
            'failed to fetch',
            'network request failed',
            'processing failed',
            'error in processSubmission',
            'failed to start processing'
          ];

          const errorString = err.toString().toLowerCase();
          const causeString = (err as Error & { cause?: { message?: string } }).cause?.message?.toLowerCase() || '';
          const messageString = err.message?.toLowerCase() || '';
          
          const isRetryable = retryableErrors.some(e => 
            errorString.includes(e.toLowerCase()) || 
            causeString.includes(e.toLowerCase()) ||
            messageString.includes(e.toLowerCase())
          );

          console.log('[Process] Error retry check:', {
            isRetryable,
            errorString: errorString.substring(0, 100),
            causeString: causeString.substring(0, 100),
            messageString: messageString.substring(0, 100)
          });

          return isRetryable;
        };
        
        if (retryCount < maxRetries && shouldRetry(e)) {
          const delay = Math.min(5000 * Math.pow(2, retryCount), 80000);
          console.log(`[Process] Error is retryable, scheduling retry:`, {
            attempt: retryCount + 1,
            maxRetries,
            delaySeconds: delay/1000,
            submissionId: submission.submission_id
          });
          
          // Add detailed log entry
          console.log('[Process] Updating submission with retry status...');
          await supabaseAdmin
            .from('form_submissions')
            .update({
              stage: 'retry',
              message: `Attempt ${retryCount + 1}/${maxRetries} failed, retrying in ${delay/1000} seconds`,
              error: {
                message: e.message,
                cause: (e as Error & { cause?: { message?: string } }).cause?.message,
                stack: e.stack,
                type: e.name || typeof e
              },
              timestamp: new Date().toISOString()
            })
            .eq('submission_id', submission.submission_id);

          await new Promise(resolve => setTimeout(resolve, delay));
          return triggerProcessWithRetry(retryCount + 1, maxRetries);
        } else {
          const errorMessage = !shouldRetry(e) 
            ? 'Processing failed with non-retryable error' 
            : 'Failed to start processing after multiple retries';

          console.error('[Process] Final error:', {
            message: errorMessage,
            error: e.message,
            retryAttempts: retryCount,
            submissionId: submission.submission_id
          });

          // Add detailed final error log
          console.log('[Process] Updating submission with final error status...');
          await supabaseAdmin
            .from('form_submissions')
            .update({
              status: 'error',
              progress: {
                stage: 'error',
                message: errorMessage,
                timestamp: new Date().toISOString(),
                details: {
                  error: {
                    message: e.message,
                    cause: (e as Error & { cause?: { message?: string } }).cause?.message,
                    stack: e.stack,
                    type: e.name || typeof e
                  },
                  retryAttempts: retryCount,
                  lastAttempt: new Date().toISOString()
                }
              },
              logs: (logs: any[] | null) => logs ? [...logs, {
                stage: 'error',
                message: errorMessage,
                error: {
                  message: e.message,
                  cause: (e as Error & { cause?: { message?: string } }).cause?.message,
                  stack: e.stack,
                  type: e.name || typeof e
                },
                retryAttempts: retryCount,
                timestamp: new Date().toISOString()
              }] : [{
                stage: 'error',
                message: errorMessage,
                error: {
                  message: e.message,
                  cause: (e as Error & { cause?: { message?: string } }).cause?.message,
                  stack: e.stack,
                  type: e.name || typeof e
                },
                retryAttempts: retryCount,
                timestamp: new Date().toISOString()
              }],
              updated_at: new Date().toISOString()
            })
            .eq('submission_id', submission.submission_id);
        }
      }
    };

    // Start the retry process
    triggerProcessWithRetry().catch(error => {
      console.error('[Process] Final error in retry process:', {
        error: error.message,
        cause: error.cause?.message,
        stack: error.stack,
        submissionId: submission.submission_id
      });
    });

    // Return success immediately
    console.log('[JotForm Webhook] Returning success response');
    return NextResponse.json({ 
      message: 'Submission received and processing started',
      submissionId: submission.submission_id,
      links: {
        status: `/api/submission/status?id=${submission.submission_id}`,
        results: `/results?s=${submission.submission_id}`
      }
    });

  } catch (error) {
    console.error('[JotForm Webhook] Error processing webhook:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      cause: error instanceof Error ? (error as Error & { cause?: any }).cause : undefined
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
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