import { supabaseAdmin } from './supabase-admin';

interface WebhookPayload {
  form: {
    id: string;
    submission_id: string;
    results_url: string;
  };
  customer: {
    name?: string;
    email?: string;
    phone?: string;
  };
  form_data: Record<string, any>;
  result: {
    finalResponse: string;
    tokenCount: number;
  };
}

// Helper function to find customer details in form data
function findCustomerDetails(formData: any): WebhookPayload['customer'] {
  const customer: WebhookPayload['customer'] = {};

  // Common field patterns for customer information
  const patterns = {
    name: [
      /^(name|fullname|full_name|שם|שם_מלא)$/i,
      /(^|_)(first|last)?name($|_)/i,
      /שם.*משפחה/i,
      /שם.*פרטי/i
    ],
    email: [
      /^(email|mail|אימייל|מייל)$/i,
      /(^|_)(email|mail)($|_)/i,
      /דואר.*אלקטרוני/i
    ],
    phone: [
      /^(phone|mobile|tel|טלפון|נייד)$/i,
      /(^|_)(phone|mobile|tel)($|_)/i,
      /טלפון.*נייד/i,
      /מספר.*טלפון/i
    ]
  };

  // Search through form data for matching fields
  Object.entries(formData).forEach(([key, value]) => {
    // Skip if value is not a string or is empty
    if (typeof value !== 'string' || !value.trim()) return;

    // Check each pattern type
    Object.entries(patterns).forEach(([field, fieldPatterns]) => {
      if (!customer[field as keyof typeof customer]) { // Only set if not already found
        const matches = fieldPatterns.some(pattern => pattern.test(key));
        if (matches) {
          customer[field as keyof typeof customer] = value.trim();
        }
      }
    });
  });

  return customer;
}

export async function sendWebhook(submissionId: string): Promise<void> {
  try {
    // Fetch submission and template data
    const { data: submission } = await supabaseAdmin
      .from('form_submissions')
      .select('*, templates!inner(*)')
      .eq('submission_id', submissionId)
      .single();

    if (!submission?.templates?.webhook_url) {
      console.log('No webhook URL configured for template');
      return;
    }

    const webhookUrl = submission.templates.webhook_url;
    const formData = submission.content?.form_data || submission.content || {};
    const customer = findCustomerDetails(formData);

    const payload: WebhookPayload = {
      form: {
        id: submission.form_id,
        submission_id: submission.submission_id,
        results_url: `https://md-html-template.vercel.app/results?s=${submission.submission_id}`
      },
      customer,
      form_data: formData,
      result: submission.result
    };

    // Update status to sending
    await supabaseAdmin
      .from('form_submissions')
      .update({
        webhook_status: 'sending',
        updated_at: new Date().toISOString()
      })
      .eq('submission_id', submissionId);

    // Send webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Webhook failed with status ${response.status}`);
    }

    // Update status to sent
    await supabaseAdmin
      .from('form_submissions')
      .update({
        webhook_status: 'sent',
        webhook_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('submission_id', submissionId);

  } catch (error) {
    console.error('Error sending webhook:', error);

    // Update error status
    await supabaseAdmin
      .from('form_submissions')
      .update({
        webhook_status: 'error',
        webhook_error: error instanceof Error ? error.message : 'Unknown error',
        updated_at: new Date().toISOString()
      })
      .eq('submission_id', submissionId);

    throw error;
  }
} 