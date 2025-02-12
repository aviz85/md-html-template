import { supabaseAdmin } from './supabase-admin';

interface WhatsAppMessage {
  chatId: string;
  message: string;
}

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://api.green-api.com';
const DEFAULT_INSTANCE_ID = process.env.WHATSAPP_INSTANCE_ID;
const DEFAULT_API_TOKEN = process.env.WHATSAPP_API_TOKEN;

export async function sendWhatsAppMessage(submissionId: string): Promise<void> {
  try {
    console.log('Starting WhatsApp process for submission:', submissionId);
    
    // Fetch submission and template data
    const { data: submission } = await supabaseAdmin
      .from('form_submissions')
      .select(`
        *,
        template:templates!left (
          id,
          send_whatsapp,
          whatsapp_message,
          whatsapp_instance_id,
          whatsapp_api_token
        )
      `)
      .eq('submission_id', submissionId)
      .single();

    if (!submission) {
      console.error('No submission found for ID:', submissionId);
      throw new Error('Submission not found');
    }

    if (!submission.template?.send_whatsapp) {
      console.log('WhatsApp sending not enabled for template');
      return;
    }

    // Use template-specific credentials if available, otherwise use defaults
    const instanceId = submission.template.whatsapp_instance_id || DEFAULT_INSTANCE_ID;
    const apiToken = submission.template.whatsapp_api_token || DEFAULT_API_TOKEN;
    const { whatsapp_message } = submission.template;
    
    if (!instanceId || !apiToken || !whatsapp_message) {
      throw new Error('Missing WhatsApp configuration');
    }

    const formData = submission.content?.form_data || submission.content || {};
    const phone = submission.recipient_phone;

    if (!phone) {
      throw new Error('No phone number found for recipient');
    }

    // Format phone number for WhatsApp API (remove leading 0, add 972)
    const whatsappPhone = phone.startsWith('0') ? 
      `972${phone.slice(1)}@c.us` : 
      `${phone}@c.us`;

    // Replace template variables
    const message = whatsapp_message.replace(/{{(\w+)}}/g, (match, key) => {
      if (key === 'id') return submissionId;
      return match;
    });

    const payload: WhatsAppMessage = {
      chatId: whatsappPhone,
      message
    };

    // Send WhatsApp message
    const apiUrl = `${WHATSAPP_API_URL}/waInstance${instanceId}/sendMessage/${apiToken}`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WhatsApp API error: ${error}`);
    }

    // Update submission status
    await supabaseAdmin
      .from('form_submissions')
      .update({
        whatsapp_status: 'sent',
        whatsapp_sent_at: new Date().toISOString()
      })
      .eq('submission_id', submissionId);

  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    
    // Update submission with error
    await supabaseAdmin
      .from('form_submissions')
      .update({
        whatsapp_status: 'error',
        whatsapp_error: error.message
      })
      .eq('submission_id', submissionId);

    throw error;
  }
} 