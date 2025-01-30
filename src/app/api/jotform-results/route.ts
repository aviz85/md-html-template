import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processSubmission } from '@/lib/claude';

export const runtime = 'nodejs';
export const maxDuration = 10; // Set timeout to 10 seconds for initial handler

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

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

    console.log('About to save submission with:', {
      form_data: formData,
      submission_id: formData.submissionID || formData.submission_id,
      template_id: formData.templateId || formData.template_id,
    });

    // Save to database first
    const { data: submission, error: submissionError } = await supabase
      .from('form_submissions')
      .insert({
        form_id: formData.formID || '250194606110042',
        submission_id: formData.submissionID || formData.submission_id || 'test123',
        content: formData.form_data || formData,
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
          signal: AbortSignal.timeout(30000)
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        console.log('Process request sent successfully for submission:', submission.submission_id);
      } catch (error) {
        console.error(`Background process request failed (attempt ${retryCount + 1}):`, error);
        
        // Check if error is retryable
        const shouldRetry = (error: any) => {
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
          const errorString = error.toString().toLowerCase();
          const causeString = error.cause?.toString().toLowerCase() || '';
          const messageString = error.message?.toLowerCase() || '';
          
          return retryableErrors.some(e => 
            errorString.includes(e.toLowerCase()) || 
            causeString.includes(e.toLowerCase()) ||
            messageString.includes(e.toLowerCase())
          );
        };
        
        if (retryCount < maxRetries && shouldRetry(error)) {
          const delay = Math.min(5000 * Math.pow(2, retryCount), 80000);
          console.log(`Error is retryable, waiting ${delay/1000} seconds... (${retryCount + 1}/${maxRetries})`);
          
          // Add detailed log entry
          await supabase
            .from('form_submissions')
            .update({
              logs: supabase.sql`array_append(logs, ${JSON.stringify({
                stage: 'retry',
                message: `Attempt ${retryCount + 1}/${maxRetries} failed, retrying in ${delay/1000} seconds`,
                error: {
                  message: error.message,
                  cause: error.cause?.message,
                  stack: error.stack,
                  type: error.name || typeof error
                },
                timestamp: new Date().toISOString()
              })}::jsonb)`,
              updated_at: new Date().toISOString()
            })
            .eq('submission_id', submission.submission_id);

          await new Promise(resolve => setTimeout(resolve, delay));
          return triggerProcessWithRetry(retryCount + 1, maxRetries);
        } else {
          // If error is not retryable or max retries reached
          const errorMessage = !shouldRetry(error) 
            ? 'Processing failed with non-retryable error' 
            : 'Failed to start processing after multiple retries';

          // Add detailed final error log
          await supabase
            .from('form_submissions')
            .update({
              status: 'error',
              progress: {
                stage: 'error',
                message: errorMessage,
                timestamp: new Date().toISOString(),
                details: {
                  error: {
                    message: error.message,
                    cause: error.cause?.message,
                    stack: error.stack,
                    type: error.name || typeof error
                  },
                  retryAttempts: retryCount,
                  lastAttempt: new Date().toISOString()
                }
              },
              logs: supabase.sql`array_append(logs, ${JSON.stringify({
                stage: 'error',
                message: errorMessage,
                error: {
                  message: error.message,
                  cause: error.cause?.message,
                  stack: error.stack,
                  type: error.name || typeof error
                },
                retryAttempts: retryCount,
                timestamp: new Date().toISOString()
              })}::jsonb)`,
              updated_at: new Date().toISOString()
            })
            .eq('submission_id', submission.submission_id);
          
          console.error('Final error details:', {
            message: errorMessage,
            error: {
              message: error.message,
              cause: error.cause?.message,
              stack: error.stack,
              type: error.name || typeof error
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
    
    let query = supabase
      .from('form_submissions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
      
    if (formId) {
      query = query.eq('form_id', formId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching submissions:', error);
      throw error;
    }
    
    return NextResponse.json({ submissions: data });
    
  } catch (error) {
    console.error('Error listing submissions:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 