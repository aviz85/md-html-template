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
  
  // Call edge function to start transcription
  console.log('[Transcription] Calling process-tasks function to initiate transcription...');
  const response = await fetch('https://fdecrxcxrshebgrmbywz.supabase.co/functions/v1/process-tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
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

  const { jobId } = await response.json();
  console.log(`[Transcription] Job started successfully. JobID: ${jobId}`);

  // Poll for completion
  let attempts = 0;
  while (true) {
    attempts++;
    console.log(`[Transcription] Checking status for jobId ${jobId} (attempt ${attempts})`);
    
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
    
    if (status.status === 'completed') {
      console.log(`[Transcription] Job ${jobId} completed successfully. Text length: ${status.text?.length || 0}`);
      return status.text;
    }

    if (status.status === 'failed') {
      console.error(`[Transcription] Job ${jobId} failed:`, status.error);
      throw new Error(`Transcription failed: ${status.error}`);
    }

    console.log(`[Transcription] Job ${jobId} still processing. Waiting 5 seconds before next check...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
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
        
        // Replace the audio file path with the transcription in both formData and parsedRequest
        if (formData.parsedRequest) {
          formData.parsedRequest[fieldName] = transcription;
          console.log(`[JotForm Webhook] Updated parsedRequest with transcription for ${fieldName}`);
        }
        formData[fieldName] = transcription;
        
        // Update pretty field by replacing the audio path with the transcription
        if (formData.pretty) {
          const oldPretty = formData.pretty;
          formData.pretty = formData.pretty.replace(
            `${questionLabel}:${path}`,
            `${questionLabel}:${transcription}`
          );
          console.log(`[JotForm Webhook] Updated pretty field. Changed: ${oldPretty !== formData.pretty}`);
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
    const { data: submission, error: submissionError } = await supabaseAdmin
      .from('form_submissions')
      .insert({
        form_id: formData.formID || '250194606110042',
        submission_id: formData.submissionID || formData.submission_id || 'test123',
        content: {
          ...formData,
          parsedRequest: formData.parsedRequest || undefined
        },
        status: 'pending'
      })
      .select()
      .single();

    if (submissionError) {
      console.error('[JotForm Webhook] Error saving submission:', submissionError);
      throw submissionError;
    }

    console.log('[JotForm Webhook] Submission saved successfully:', {
      id: submission.id,
      submission_id: submission.submission_id,
      status: submission.status
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
    return NextResponse.json(submissions);
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