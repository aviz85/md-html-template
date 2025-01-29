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

            // No need to update status here since processSubmission handles it
            
            // After processing submission, try to send email
            console.log('🔍 Starting email process for submission:', submissionId);
            
            // Log form_id for debugging
            console.log('📝 Form ID details:', {
              form_id: submission.form_id,
              submission_content: submission.content
            });
            
            const { data: template, error: templateError } = await supabaseAdmin
              .from('templates')
              .select('*')
              .eq('form_id', submission.form_id)  // Changed from id to form_id
              .single();

            if (templateError) {
              console.error('❌ Failed to fetch template:', templateError);
              console.log('⚠️ Continuing without sending email');
              // Don't throw, just continue without email
              return {
                message: 'Processing completed (no email sent - template error)',
                submissionId,
                result: {
                  ...result,
                  finalResponse: cleanResponse
                }
              };
            }

            // Check if template exists but has no required email fields
            if (!template?.email_body || !template?.email_subject) {
              console.warn('⚠️ Template missing required email fields:', {
                template_id: template?.id,
                has_body: !!template?.email_body,
                has_subject: !!template?.email_subject,
                has_from: !!template?.email_from
              });
              // Don't throw, just continue without email
              return {
                message: 'Processing completed (no email sent - missing required template fields)',
                submissionId,
                result: {
                  ...result,
                  finalResponse: cleanResponse
                }
              };
            }

            console.log('📋 Found template with all required fields');

            // Find email in content using improved findEmailInFormData
            const recipientEmail = findEmailInFormData(submission.content);
              
            if (!recipientEmail) {
              console.warn('⚠️ No recipient email found in submission data');
              return {
                message: 'Processing completed (no email sent - no recipient)',
                submissionId,
                result: {
                  ...result,
                  finalResponse: cleanResponse
                }
              };
            }

            console.log('✉️ Found recipient email:', recipientEmail);
            
            const emailHtml = replaceVariables(template.email_body, {
              ...submission.content,
              submission: {
                created_at: submission.created_at,
                id: submission.submission_id,
                form_id: submission.form_id
              }
            });

            const emailSubject = replaceVariables(template.email_subject, {
              ...submission.content,
              submission: {
                created_at: submission.created_at,
                id: submission.submission_id,
                form_id: submission.form_id
              }
            });

            // Use template name as display name, and email from editor or default
            const defaultEmail = 'no-reply@reports.vocalvault.ai';
            const senderEmail = template.email_from?.trim() || process.env.DEFAULT_EMAIL_FROM || defaultEmail;
            const formattedSender = `${template.name} <${senderEmail}>`;

            console.log('📧 Attempting to send email:', {
              to: recipientEmail,
              from: formattedSender,
              subject: emailSubject.substring(0, 50) + '...',
              submissionId: submission.id
            });

            // Update DB that we're attempting to send email
            await supabaseAdmin
              .from('form_submissions')
              .update({
                email_status: 'sending',
                recipient_email: recipientEmail,
                updated_at: new Date().toISOString()
              })
              .eq('submission_id', submissionId);

            await sendEmail({
              to: recipientEmail,
              from: formattedSender,
              subject: emailSubject,
              html: emailHtml,
              submissionId: submission.id
            });

            // Update DB that email was sent successfully
            await supabaseAdmin
              .from('form_submissions')
              .update({
                email_status: 'sent',
                email_sent_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('submission_id', submissionId);

            console.log('✅ Email sent successfully');

            // Even if email fails, we keep the completed status from processSubmission
            return {
              message: 'Processing completed',
              submissionId,
              result: {
                ...result,
                finalResponse: cleanResponse
              }
            };
          } catch (processError) {
            // Only update status if it's a processing error, not an email error
            console.error('Error in processSubmission:', processError);
            
            // Update email status if it's an email error
            if (submissionId && (processError as Error)?.message?.includes('email')) {
              await supabaseAdmin
                .from('form_submissions')
                .update({
                  email_status: 'error',
                  email_error: (processError as Error).message,
                  updated_at: new Date().toISOString()
                })
                .eq('submission_id', submissionId);
            }
            
            // Let processSubmission handle its own status updates
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