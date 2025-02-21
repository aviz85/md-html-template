import { processSubmission } from '@/lib/claude'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { findEmailInFormData, replaceVariables, sendEmail } from '@/lib/email'
import { sendWebhook, sendPreprocessingWebhook, findCustomerDetails } from '@/lib/webhook'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

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
            // After transcription handling and before Claude processing
            const { data: template, error: templateError } = await supabaseAdmin
              .from('templates')
              .select('*')
              .eq('form_id', submission.form_id)
              .single();

            // Process the submission with Claude
            const result = await processSubmission(submissionId);

            // Don't split by backticks, keep the original response
            const cleanResponse = result.finalResponse;

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

            if (template?.preprocessing_webhook_url) {
              try {
                // Validate webhook URL
                const webhookUrl = template.preprocessing_webhook_url.trim();
                if (!/^https?:\/\/.+/.test(webhookUrl)) {
                  throw new Error('Invalid preprocessing webhook URL format');
                }

                console.log('🔄 Starting preprocessing webhook:', webhookUrl);
                
                // Update status
                await supabaseAdmin
                  .from('form_submissions')
                  .update({
                    preprocessing_webhook_status: 'sending',
                    updated_at: new Date().toISOString()
                  })
                  .eq('submission_id', submissionId);

                const webhookResponse = await sendPreprocessingWebhook(submissionId, webhookUrl);

                // Update submission with processed content
                await supabaseAdmin
                  .from('form_submissions')
                  .update({
                    content: webhookResponse.content,
                    preprocessing_webhook_status: 'completed',
                    preprocessing_webhook_response: webhookResponse,
                    updated_at: new Date().toISOString()
                  })
                  .eq('submission_id', submissionId);

                console.log('✅ Preprocessing webhook completed successfully');

                // Skip Claude processing if requested
                if (webhookResponse.skip_processing) {
                  return {
                    message: 'Processing skipped by preprocessing webhook',
                    submissionId,
                    result: {
                      finalResponse: 'Processing skipped by webhook',
                      tokenCount: 0
                    }
                  };
                }

              } catch (error) {
                console.error('❌ Preprocessing webhook error:', error);
                
                // Update error status but continue with processing
                await supabaseAdmin
                  .from('form_submissions')
                  .update({
                    preprocessing_webhook_status: 'error',
                    preprocessing_webhook_error: error instanceof Error ? error.message : 'Unknown error',
                    updated_at: new Date().toISOString()
                  })
                  .eq('submission_id', submissionId);
              }
            }

            // No need to update status here since processSubmission handles it
            
            // After processing submission, try to send email
            console.log('🔍 Starting email process for submission:', submissionId);
            
            // Log form_id for debugging
            console.log('📝 Form ID details:', {
              form_id: submission.form_id,
              submission_content: submission.content
            });
            
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

            // Find customer details in content
            const formData = submission.content?.form_data || submission.content || {};
            const customer = findCustomerDetails(formData);
              
            if (!customer.email) {
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

            // Only send email if send_email is not false
            if (template.send_email !== false) {
              console.log('✉️ Found recipient email:', customer.email);
              
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
              // Ensure valid email format and use default if empty or invalid
              const senderEmail = template.email_from?.trim()?.includes('@') 
                ? template.email_from.trim() 
                : defaultEmail;
              
              // Ensure email format is valid for Mailgun
              const formattedSender = template.name 
                ? `"${template.name.replace(/"/g, '')}" <${senderEmail}>`  // Escape quotes in name
                : `"VocalVault Reports" <${senderEmail}>`;  // Always include display name

              console.log('📧 Attempting to send email:', {
                to: customer.email,
                from: formattedSender,
                subject: emailSubject.substring(0, 50) + '...',
                submissionId: submission.id
              });

              // Update DB that we're attempting to send email
              await supabaseAdmin
                .from('form_submissions')
                .update({
                  email_status: 'sending',
                  recipient_email: customer.email,
                  recipient_phone: customer.phone,
                  updated_at: new Date().toISOString()
                })
                .eq('submission_id', submissionId);

              await sendEmail({
                to: customer.email,
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
            } else {
              console.log('📫 Email sending disabled for this template');
            }

            // Handle WhatsApp if enabled
            if (template.send_whatsapp) {
              try {
                console.log('📱 Checking WhatsApp configuration:', {
                  templateId: template.id,
                  hasMessage: !!template.whatsapp_message,
                  hasPhone: !!customer.phone
                });

                if (!customer.phone) {
                  console.warn('⚠️ No phone number found in submission data');
                } else {
                  console.log('📞 Starting WhatsApp process with phone:', customer.phone);
                  await sendWhatsAppMessage(submissionId);
                  console.log('✅ WhatsApp message sent successfully');
                }
              } catch (whatsappError) {
                console.error('❌ WhatsApp error:', whatsappError);
                // Don't throw - we want to continue even if WhatsApp fails
              }
            } else {
              console.log('📱 WhatsApp sending not enabled for this template');
            }

            // Handle webhook if URL exists and is valid
            if (template.webhook_url) {
              try {
                // Validate webhook URL
                const webhookUrl = template.webhook_url.trim();
                if (/^https?:\/\/.+/.test(webhookUrl)) {
                  console.log('🔗 Starting webhook process:', webhookUrl);
                  await sendWebhook(submissionId);
                  console.log('✅ Webhook sent successfully');
                } else {
                  console.warn('⚠️ Invalid webhook URL format:', webhookUrl);
                }
              } catch (webhookError) {
                console.error('❌ Webhook error:', webhookError);
                // Don't throw - we want to continue even if webhook fails
              }
            }

            // Even if email or webhook fails, we keep the completed status from processSubmission
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