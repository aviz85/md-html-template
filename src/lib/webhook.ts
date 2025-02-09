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
      /דואר.*אלקטרוני/i,
      /^JJ$/i  // Special case for our forms
    ],
    phone: [
      /^(phone|mobile|tel|טלפון|נייד)$/i,
      /(^|_)(phone|mobile|tel)($|_)/i,
      /טלפון.*נייד/i,
      /מספר.*טלפון/i
    ]
  };

  // Helper function to check if a string looks like a full name (2+ words)
  const isFullName = (str: string): boolean => {
    const words = str.trim().split(/\s+/);
    return words.length >= 2 && words.every(word => /^[\u0590-\u05FFa-zA-Z]+$/.test(word));
  };

  // Helper function to check if a string is a valid phone number
  const isPhoneNumber = (str: string): boolean => {
    return /^[\d\-+() ]{9,}$/.test(str.trim());
  };

  // Helper function to check if a string is a valid email
  const isEmail = (str: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim());
  };

  // First pass: Find fields by patterns
  Object.entries(formData).forEach(([key, value]) => {
    if (typeof value !== 'string' || !value.trim()) return;

    Object.entries(patterns).forEach(([field, fieldPatterns]) => {
      if (!customer[field as keyof typeof customer]) {
        const matches = fieldPatterns.some(pattern => pattern.test(key));
        if (matches) {
          // Validate value based on field type
          if (field === 'email' && isEmail(value) ||
              field === 'phone' && isPhoneNumber(value) ||
              field === 'name' && isFullName(value)) {
            customer[field as keyof typeof customer] = value.trim();
          }
        }
      }
    });
  });

  // Second pass: Find by value format and proximity
  if (!customer.name || !customer.email || !customer.phone) {
    // Convert form data to array of entries for easier proximity analysis
    const entries = Object.entries(formData);
    
    entries.forEach(([key, value], index) => {
      if (typeof value !== 'string' || !value.trim()) return;
      const valueStr = value.trim();

      // Find email by format if not found
      if (!customer.email && isEmail(valueStr)) {
        customer.email = valueStr;
        
        // Look for name in adjacent fields (before and after)
        for (let i = Math.max(0, index - 2); i <= Math.min(entries.length - 1, index + 2); i++) {
          const [_, adjacentValue] = entries[i];
          if (typeof adjacentValue === 'string' && isFullName(adjacentValue)) {
            customer.name = adjacentValue.trim();
            break;
          }
        }
      }

      // Find phone by format if not found
      if (!customer.phone && isPhoneNumber(valueStr)) {
        customer.phone = valueStr;
      }

      // Find name by format if not found
      if (!customer.name && isFullName(valueStr)) {
        customer.name = valueStr;
      }
    });
  }

  // Clean up phone number format
  if (customer.phone) {
    customer.phone = customer.phone.replace(/[^\d+]/g, '');
    if (customer.phone.startsWith('972')) {
      customer.phone = '0' + customer.phone.slice(3);
    }
  }

  console.log('Found customer details:', customer);
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