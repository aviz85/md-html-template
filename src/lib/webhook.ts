import { supabaseAdmin } from './supabase-admin';
import { sendWhatsAppMessage } from './whatsapp';

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

// Helper function to normalize phone number
const normalizePhone = (phone: string): string => {
  // First remove formatting chars but keep + prefix
  let cleaned = phone.replace(/[\s\-()]/g, '');
  
  // Handle international format
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }
  
  // Convert 972 prefix to 0
  if (cleaned.startsWith('972')) {
    cleaned = '0' + cleaned.slice(3);
  }
  
  // Ensure starts with 0
  if (!cleaned.startsWith('0')) {
    cleaned = '0' + cleaned;
  }
  
  return cleaned;
};

// Helper function to find customer details in form data
export function findCustomerDetails(formData: any): WebhookPayload['customer'] {
  const customer: WebhookPayload['customer'] = {};
  console.log('Starting customer details search in formData:', formData);

  // בדיקת שדה pretty
  if (formData.pretty && typeof formData.pretty === 'string') {
    console.log('Found pretty field:', formData.pretty);
    const fields = formData.pretty.split(',').map((field: string) => field.trim());
    console.log('Split pretty fields:', fields);
    
    for (const field of fields) {
      const [key, ...rest] = field.split(':');
      const value = rest.join(':').trim();
      
      if (!key || !value) {
        console.log('Skipping empty field:', { key, value });
        continue;
      }

      const cleanKey = key.trim();
      console.log('Processing pretty field:', { cleanKey, value });

      if (cleanKey === 'שם מלא') {
        customer.name = value;
        console.log('Found name in pretty:', value);
      }
      else if (cleanKey === 'אימייל') {
        customer.email = value;
        console.log('Found email in pretty:', value);
      }
      else if (cleanKey === 'מספר טלפון' || cleanKey === 'טלפון נייד') {
        const rawPhone = value.replace(/[^\d+]/g, ''); // שומר על + במקרה של מספר בינלאומי
        customer.phone = normalizePhone(rawPhone);
        console.log('Found phone in pretty:', { original: value, cleaned: customer.phone });
      }
    }

    // אם מצאנו את כל הפרטים ב-pretty, נחזיר
    if (customer.name && customer.email && customer.phone) {
      console.log('Found all details in pretty field:', customer);
      return customer;
    } else {
      console.log('Missing some details in pretty field:', {
        foundName: !!customer.name,
        foundEmail: !!customer.email,
        foundPhone: !!customer.phone
      });
    }
  } else {
    console.log('No pretty field found or invalid type:', formData.pretty);
  }

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
      /מספר.*טלפון/i,
      /^טלפון נייד$/i,
      /^מספר טלפון$/i
    ]
  };

  // Helper function to check if a string looks like a full name (2+ words)
  const isFullName = (str: string): boolean => {
    const words = str.trim().split(/\s+/);
    return words.length >= 2 && words.every(word => /^[\u0590-\u05FFa-zA-Z]+$/.test(word));
  };

  // Helper function to check if a string is a valid phone number
  const isPhoneNumber = (str: string): boolean => {
    // Remove all formatting characters first
    const cleaned = str.replace(/[\s\-()]/g, '');
    // Check if it's a valid phone number format
    return /^(?:\+?972|0)\d{8,9}$/.test(cleaned);
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
            if (field === 'phone') {
              customer[field] = normalizePhone(value);
            } else {
              customer[field as keyof typeof customer] = value.trim();
            }
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
        customer.phone = normalizePhone(valueStr);
      }

      // Find name by format if not found
      if (!customer.name && isFullName(valueStr)) {
        customer.name = valueStr;
      }
    });
  }

  console.log('Found customer details:', customer);
  return customer;
}

export async function sendWebhook(submissionId: string): Promise<void> {
  try {
    console.log('Starting webhook process for submission:', submissionId);
    
    // Fetch submission and template data
    const { data: submission } = await supabaseAdmin
      .from('form_submissions')
      .select(`
        *,
        template:templates!left (
          id,
          webhook_url,
          send_email,
          send_whatsapp,
          email_subject,
          email_body,
          email_from
        )
      `)
      .eq('submission_id', submissionId)
      .single();

    if (!submission) {
      console.error('No submission found for ID:', submissionId);
      throw new Error('Submission not found');
    }

    const webhookUrl = submission.template?.webhook_url;
    const formData = submission.content?.form_data || submission.content || {};
    const customer = findCustomerDetails(formData);

    // Update recipient info
    await supabaseAdmin
      .from('form_submissions')
      .update({
        recipient_email: customer.email,
        recipient_phone: customer.phone
      })
      .eq('submission_id', submissionId);

    // Build results URL
    const resultsUrl = new URL('/results', 'https://md-html-template.vercel.app');
    resultsUrl.searchParams.set('s', submissionId);

    console.log('Generated results URL:', resultsUrl.toString());

    const payload: WebhookPayload = {
      form: {
        id: submission.form_id,
        submission_id: submissionId,
        results_url: resultsUrl.toString()
      },
      customer,
      form_data: formData,
      result: submission.result
    };

    // Send webhook if configured
    if (webhookUrl) {
      console.log('Sending webhook to:', webhookUrl);
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Webhook failed with status ${response.status}`);
      }
    }

    // Send WhatsApp if enabled
    if (submission.template?.send_whatsapp) {
      await sendWhatsAppMessage(submissionId);
    }

  } catch (error) {
    console.error('Error in webhook process:', error);
    throw error;
  }
} 