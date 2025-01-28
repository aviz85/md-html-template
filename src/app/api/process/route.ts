import { processSubmission } from '@/lib/claude'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { findEmailInFormData, replaceVariables, sendEmail } from '@/lib/email'

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

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes timeout for Vercel Pro plan

// Shared handler for both GET and POST
async function handleRequest(req: Request) {
  let submissionId: string | undefined;
  
  try {
    // Try to get submissionId from query params first
    const url = new URL(req.url);
    submissionId = url.searchParams.get('submissionId') || undefined;

    // If not in query params, try to get from body for POST requests
    if (!submissionId && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      submissionId = body.submissionId;
    }
    
    if (!submissionId) {
      return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 });
    }

    // Try up to 5 times with increasing delays to find the submission
    let attempts = 0;
    let lastError;
    const delays = [2000, 3000, 5000, 8000, 13000]; // Fibonacci-like sequence for backoff
    
    // Set overall timeout of 4 minutes (leaving 1 minute buffer from Vercel's 5 minute limit)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Processing timeout after 4 minutes')), 240000);
    });

    const processPromise = (async () => {
      while (attempts < delays.length) {
        try {
          const { data: submission } = await supabaseAdmin
            .from('form_submissions')
            .select('*')
            .eq('submission_id', submissionId)
            .single();

          if (!submission) {
            lastError = new Error('Submission not found');
            console.log(`Attempt ${attempts + 1}: Submission not found, waiting ${delays[attempts]}ms`);
            await new Promise(resolve => setTimeout(resolve, delays[attempts]));
            attempts++;
            continue;
          }

          // Update status to processing
          await supabaseAdmin
            .from('form_submissions')
            .update({
              status: 'processing',
              progress: {
                stage: 'init',
                message: 'התחלת עיבוד',
                timestamp: new Date().toISOString()
              }
            })
            .eq('submission_id', submissionId);

          try {
            // Process the submission
            const result = await processSubmission(submissionId);

            // Don't split by backticks, keep the original response
            const cleanResponse = result.finalResponse;

            // Update final status and result
            await supabaseAdmin
              .from('form_submissions')
              .update({
                status: 'completed',
                result: {
                  finalResponse: cleanResponse,
                  tokenCount: result.tokenCount
                }
              })
              .eq('submission_id', submissionId);

            // After processing submission, try to send email
            console.log('🔍 Starting email process for submission:', submissionId);
            
            const { data: template, error: templateError } = await supabaseAdmin
              .from('templates')
              .select('*')
              .eq('id', submission.template_id)
              .single();

            if (templateError) {
              console.error('❌ Failed to fetch template:', templateError);
              throw templateError;
            }

            console.log('📋 Found template:', {
              id: template?.id,
              has_email_body: !!template?.email_body,
              has_email_subject: !!template?.email_subject,
              has_email_from: !!template?.email_from
            });

            if (template?.email_body && template?.email_subject && template?.email_from) {
              console.log('🔍 Looking for recipient email in form_data:', submission.form_data);
              const recipientEmail = findEmailInFormData(submission.form_data);
              
              if (recipientEmail) {
                console.log('✉️ Found recipient email:', recipientEmail);
                
                const emailHtml = replaceVariables(template.email_body, {
                  ...submission.form_data,
                  submission: {
                    created_at: submission.created_at,
                    id: submission.id
                  }
                });

                const emailSubject = replaceVariables(template.email_subject, {
                  ...submission.form_data,
                  submission: {
                    created_at: submission.created_at,
                    id: submission.id
                  }
                });

                console.log('📧 Attempting to send email:', {
                  to: recipientEmail,
                  from: template.email_from,
                  subject: emailSubject.substring(0, 50) + '...',
                  submissionId: submission.id
                });

                await sendEmail({
                  to: recipientEmail,
                  from: template.email_from,
                  subject: emailSubject,
                  html: emailHtml,
                  submissionId: submission.id
                });

                console.log('✅ Email sent successfully');
              } else {
                console.warn('⚠️ No recipient email found in form data');
              }
            } else {
              console.warn('⚠️ Template missing required email fields:', {
                has_body: !!template?.email_body,
                has_subject: !!template?.email_subject,
                has_from: !!template?.email_from
              });
            }

            return {
              message: 'Processing completed',
              submissionId,
              result: {
                ...result,
                finalResponse: cleanResponse
              }
            };
          } catch (processError) {
            // Handle processSubmission errors specifically
            console.error('Error in processSubmission:', processError);
            await supabaseAdmin
              .from('form_submissions')
              .update({
                status: 'error',
                progress: {
                  stage: 'processing',
                  message: processError instanceof Error ? processError.message : 'Error in processing submission',
                  timestamp: new Date().toISOString()
                }
              })
              .eq('submission_id', submissionId);
            throw processError;
          }

        } catch (error) {
          lastError = error;
          if (error instanceof Error && error.message.includes('not found')) {
            console.log(`Attempt ${attempts + 1}: Error - ${error.message}, waiting ${delays[attempts]}ms`);
            await new Promise(resolve => setTimeout(resolve, delays[attempts]));
            attempts++;
            continue;
          }
          // If it's not a "not found" error, throw immediately
          throw error;
        }
      }
      
      // If we got here, all attempts failed
      throw lastError || new Error('Failed to find submission after all retries');
    })();

    // Race between the process and the timeout
    const result = await Promise.race([processPromise, timeoutPromise]);
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('API error:', error);
    
    // Update status to error if we have a submissionId
    if (submissionId) {
      await supabaseAdmin
        .from('form_submissions')
        .update({
          status: 'error',
          progress: {
            stage: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          }
        })
        .eq('submission_id', submissionId);
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Export handlers that use the shared implementation
export const POST = handleRequest;
export const GET = handleRequest; 