import { supabaseAdmin } from './supabase-admin';

interface WhatsAppMessage {
  chatId: string;
  message: string;
}

interface WhatsAppResponse {
  idMessage: string;
  status: boolean;
  message?: string;
  error?: string;
}

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://api.green-api.com';
const DEFAULT_INSTANCE_ID = process.env.WHATSAPP_INSTANCE_ID;
const DEFAULT_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

async function addWhatsAppLog(submissionId: string, type: 'info' | 'error', message: string, data?: any) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type,
    message,
    data
  };

  await supabaseAdmin.rpc('append_log', {
    p_submission_id: submissionId,
    p_log: logEntry
  });

  if (type === 'error') {
    console.error(`WhatsApp ${message}:`, data);
  } else {
    console.log(`WhatsApp ${message}:`, data);
  }
}

async function validateWhatsAppResponse(response: Response, submissionId: string): Promise<WhatsAppResponse> {
  let responseData: WhatsAppResponse;
  
  try {
    responseData = await response.json();
  } catch (error) {
    await addWhatsAppLog(submissionId, 'error', 'Invalid JSON response', { 
      status: response.status,
      error 
    });
    throw new Error('Invalid response from WhatsApp API');
  }

  // Success is indicated by having an idMessage and no error
  if (!response.ok || !responseData.idMessage || responseData.error) {
    await addWhatsAppLog(submissionId, 'error', 'API error response', responseData);
    throw new Error(responseData.error || 'WhatsApp API error');
  }

  // If we got here, it's a success
  return {
    ...responseData,
    status: true // Ensure status is true for successful responses
  };
}

export async function sendWhatsAppMessage(submissionId: string): Promise<void> {
  let retryCount = 0;
  
  try {
    while (true) {
      try {
        console.log('WhatsApp Starting WhatsApp process:', submissionId);
        
        // Update status to processing
        await supabaseAdmin
          .from('form_submissions')
          .update({
            whatsapp_status: 'processing',
            updated_at: new Date().toISOString()
          })
          .eq('submission_id', submissionId);

        await addWhatsAppLog(submissionId, 'info', 'Starting WhatsApp process');
        
        // Fetch submission with improved error handling and explicit log output
        const { data: submission, error: submissionError } = await supabaseAdmin
          .from('form_submissions')
          .select('*')
          .eq('submission_id', submissionId)
          .single();

        if (!submission || submissionError) {
          console.log('WhatsApp No submission found:', submissionId);
          console.log('WhatsApp Query error:', submissionError);
          await addWhatsAppLog(submissionId, 'error', 'No submission found', { submissionId, error: submissionError });
          throw new Error('Submission not found');
        }

        // Then fetch the template using form_id
        console.log('WhatsApp Fetching template for form_id:', submission.form_id);
        const { data: template, error: templateError } = await supabaseAdmin
          .from('templates')
          .select('id, send_whatsapp, whatsapp_message')
          .eq('form_id', submission.form_id)
          .single();

        if (!template || templateError) {
          console.log('WhatsApp No template found for form_id:', submission.form_id);
          console.log('WhatsApp Template query error:', templateError);
          await addWhatsAppLog(submissionId, 'error', 'No template found', { 
            submissionId, 
            formId: submission.form_id,
            error: templateError 
          });
          throw new Error('Template not found');
        }

        console.log('WhatsApp Query result:', { 
          hasSubmission: !!submission, 
          hasTemplate: !!template,
          submissionId,
          formId: submission.form_id
        });

        // Combine submission and template for use later in the function
        const submissionWithTemplate = {
          ...submission,
          template
        };

        if (!submissionWithTemplate.template?.send_whatsapp) {
          await addWhatsAppLog(submissionId, 'info', 'WhatsApp sending not enabled');
          return;
        }

        // Validate configuration
        const instanceId = DEFAULT_INSTANCE_ID;
        const apiToken = DEFAULT_API_TOKEN;
        const { whatsapp_message } = submissionWithTemplate.template;
        
        if (!instanceId || !apiToken || !whatsapp_message) {
          await addWhatsAppLog(submissionId, 'error', 'Missing configuration', {
            hasInstanceId: !!instanceId,
            hasApiToken: !!apiToken,
            hasMessage: !!whatsapp_message
          });
          throw new Error('Missing WhatsApp configuration');
        }

        const phone = submissionWithTemplate.recipient_phone;
        if (!phone) {
          await addWhatsAppLog(submissionId, 'error', 'No phone number found');
          throw new Error('No phone number found for recipient');
        }

        // Format phone number
        const whatsappPhone = phone.startsWith('0') ? 
          `972${phone.slice(1)}@c.us` : 
          `${phone}@c.us`;

        // Replace template variables
        const message = whatsapp_message.replace(/{{(\w+)}}/g, (match: string, key: string) => {
          if (key === 'id') return submissionId;
          
          // Access form data if available
          if (submissionWithTemplate.content?.form_data && key in submissionWithTemplate.content.form_data) {
            return submissionWithTemplate.content.form_data[key] || match;
          }
          
          return match;
        });

        const payload: WhatsAppMessage = {
          chatId: whatsappPhone,
          message
        };

        await addWhatsAppLog(submissionId, 'info', 'Sending message', {
          phone: whatsappPhone,
          messageLength: message.length
        });

        // Send WhatsApp message
        const apiUrl = `${WHATSAPP_API_URL}/waInstance${instanceId}/sendMessage/${apiToken}`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        // Validate response
        const responseData = await validateWhatsAppResponse(response, submissionId);
        
        await addWhatsAppLog(submissionId, 'info', 'Message sent successfully', {
          messageId: responseData.idMessage
        });

        // On successful send, update status
        await supabaseAdmin
          .from('form_submissions')
          .update({
            whatsapp_status: 'sent',
            whatsapp_sent_at: new Date().toISOString(),
            whatsapp_message_id: responseData.idMessage,
            whatsapp_error: null, // Clear any previous errors
            updated_at: new Date().toISOString()
          })
          .eq('submission_id', submissionId);

        return;

      } catch (error) {
        const isRetryableError = error instanceof Error && (
          error.message.includes('network') ||
          error.message.includes('timeout') ||
          error.message.includes('socket') ||
          error.message.includes('ECONNRESET')
        );

        if (isRetryableError && retryCount < MAX_RETRIES) {
          retryCount++;
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount - 1);
          
          // Update status to retrying
          await supabaseAdmin
            .from('form_submissions')
            .update({
              whatsapp_status: 'retrying',
              whatsapp_error: `Attempt ${retryCount}/${MAX_RETRIES}: ${error instanceof Error ? error.message : String(error)}`,
              updated_at: new Date().toISOString()
            })
            .eq('submission_id', submissionId);

          await addWhatsAppLog(submissionId, 'error', 'Retrying after error', {
            error: error instanceof Error ? error.message : String(error),
            attempt: retryCount,
            nextDelay: delay
          });

          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw error; // Let the outer try-catch handle final error
      }
    }
  } catch (error) {
    // Final error handling
    await addWhatsAppLog(submissionId, 'error', 'Final error', {
      error: error instanceof Error ? error.message : String(error),
      retryAttempts: retryCount
    });
    
    await supabaseAdmin
      .from('form_submissions')
      .update({
        whatsapp_status: 'error',
        whatsapp_error: error instanceof Error ? error.message : String(error),
        whatsapp_error_details: {
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack
          } : String(error),
          retryAttempts: retryCount,
          timestamp: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq('submission_id', submissionId);

    throw error;
  }
} 