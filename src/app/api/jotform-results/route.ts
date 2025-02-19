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
  // Call edge function to start transcription
  const response = await fetch('https://fdecrxcxrshebgrmbywz.supabase.co/functions/v1/process-tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify({
      audioUrl,
      preferredLanguage: 'he' // Default to Hebrew since form is in Hebrew
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to start transcription: ${response.statusText}`);
  }

  const { jobId } = await response.json();

  // Poll for completion
  while (true) {
    const statusResponse = await fetch(
      `https://fdecrxcxrshebgrmbywz.supabase.co/functions/v1/process-tasks?jobId=${jobId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );

    if (!statusResponse.ok) {
      throw new Error(`Failed to check transcription status: ${statusResponse.statusText}`);
    }

    const status = await statusResponse.json();
    
    if (status.status === 'completed') {
      return status.text;
    }

    if (status.status === 'failed') {
      throw new Error(`Transcription failed: ${status.error}`);
    }

    // Wait 5 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

export const runtime = 'nodejs';
export const maxDuration = 300; // Increase timeout to 5 minutes to handle transcriptions

export async function POST(request: Request) {
  try {
    console.log('Starting to process request...');
    
    // Get content type
    const contentType = request.headers.get('content-type') || '';
    console.log('Content-Type:', contentType);
    
    // Parse the body based on content type
    let formData: any = {};
    let rawBody = '';
    
    if (contentType.includes('application/json')) {
      rawBody = await request.text();
      console.log('Raw request body:', rawBody);
      formData = JSON.parse(rawBody);
      console.log('Parsed form data:', formData);
      
      if (formData.rawRequest) {
        try {
          formData.parsedRequest = JSON.parse(formData.rawRequest);
        } catch (e) {
          console.error('Failed to parse rawRequest:', e);
          formData.parsedRequest = formData.rawRequest;
        }
      }
    } else if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      const formDataObj = await request.formData();
      formData = Object.fromEntries(formDataObj.entries());
      console.log('Form data after parsing:', formData);
      
      if (formData.rawRequest) {
        try {
          formData.parsedRequest = JSON.parse(formData.rawRequest);
        } catch (e) {
          console.error('Failed to parse rawRequest:', e);
          formData.parsedRequest = formData.rawRequest;
        }
      }
    }

    // Find and transcribe audio files
    const audioFiles = findAudioFiles(formData.parsedRequest || formData);
    console.log('Found audio files:', audioFiles);

    for (const { path, fieldName, questionLabel } of audioFiles) {
      try {
        console.log(`Transcribing audio file: ${path}`);
        const transcription = await transcribeAudio(path);
        
        // Replace the audio file path with the transcription in both formData and parsedRequest
        if (formData.parsedRequest) {
          formData.parsedRequest[fieldName] = transcription;
        }
        formData[fieldName] = transcription;
        
        // Update pretty field by replacing the audio path with the transcription
        if (formData.pretty) {
          formData.pretty = formData.pretty.replace(
            `${questionLabel}:${path}`,
            `${questionLabel}:${transcription}`
          );
        }
        
        console.log(`Added transcription for ${fieldName}`);
      } catch (error) {
        console.error(`Failed to transcribe ${path}:`, error);
        // Continue with other files even if one fails
      }
    }

    console.log('About to save submission with:', {
      form_data: formData,
      submission_id: formData.submissionID || formData.submission_id,
      template_id: formData.templateId || formData.template_id,
    });

    // Save to database first
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
      console.error('Error saving submission:', submissionError);
      throw submissionError;
    }

    console.log('Saved submission:', submission);

    // Start processing in background with retry mechanism
    const triggerProcessWithRetry = async (retryCount = 0, maxRetries = 5) => {
      try {
        const requestUrl = new URL(request.url);
        const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
        const processUrl = `${baseUrl}/api/process`;
        
        console.log('Triggering process at:', processUrl, 'attempt:', retryCount + 1);

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
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        console.log('Process request sent successfully for submission:', submission.submission_id);
      } catch (error) {
        const e = error as Error;
        console.error(`Background process request failed (attempt ${retryCount + 1}):`, e);
        
        // Check if error is retryable
        const shouldRetry = (err: Error) => {
          // Network errors that should trigger retry
          const retryableErrors = [
            'ECONNRESET',              // Connection reset
            'ETIMEDOUT',               // Connection timeout
            'ECONNREFUSED',            // Connection refused
            'socket disconnected',     // Socket issues
            'network socket',          // Network socket issues
            'failed to fetch',         // General fetch failure
            'network request failed',  // Network request failure
            'processing failed',       // General processing failure
            'error in processSubmission', // Process errors
            'failed to start processing'  // Startup errors
          ];

          // Check error and its cause
          const errorString = err.toString().toLowerCase();
          const causeString = (err as Error & { cause?: { message?: string } }).cause?.message?.toLowerCase() || '';
          const messageString = err.message?.toLowerCase() || '';
          
          return retryableErrors.some(e => 
            errorString.includes(e.toLowerCase()) || 
            causeString.includes(e.toLowerCase()) ||
            messageString.includes(e.toLowerCase())
          );
        };
        
        if (retryCount < maxRetries && shouldRetry(e)) {
          const delay = Math.min(5000 * Math.pow(2, retryCount), 80000);
          console.log(`Error is retryable, waiting ${delay/1000} seconds... (${retryCount + 1}/${maxRetries})`);
          
          // Add detailed log entry
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
          // If error is not retryable or max retries reached
          const errorMessage = !shouldRetry(e) 
            ? 'Processing failed with non-retryable error' 
            : 'Failed to start processing after multiple retries';

          // Add detailed final error log
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
          
          console.error('Final error details:', {
            message: errorMessage,
            error: {
              message: e.message,
              cause: (e as Error & { cause?: { message?: string } }).cause?.message,
              stack: e.stack,
              type: e.name || typeof e
            },
            retryAttempts: retryCount
          });
        }
      }
    };

    // Start the retry process
    triggerProcessWithRetry().catch(error => {
      console.error('Final error in retry process:', error);
    });

    // Return success immediately
    return NextResponse.json({ 
      message: 'Submission received and processing started',
      submissionId: submission.submission_id,
      links: {
        status: `/api/submission/status?id=${submission.submission_id}`,
        results: `/results?s=${submission.submission_id}`
      }
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const formId = searchParams.get('formId');
    
    if (!formId) {
      return NextResponse.json(
        { error: 'formId is required' },
        { status: 400 }
      );
    }

    // Get submissions for this form only
    const { data: submissions, error } = await supabaseAdmin
      .from('form_submissions')
      .select('*')
      .eq('form_id', formId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching submissions:', error);
      throw error;
    }

    return NextResponse.json(submissions);
  } catch (error) {
    console.error('Error in GET /api/jotform-results:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 