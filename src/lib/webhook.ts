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

  // Common field patterns for customer information
  const patterns = {
    name: [
      /^(name|fullname|full_name|שם|שם_מלא)$/i,
      /(^|_)(first|last)?name($|_)/i,
      /שם.*משפחה/i,
      /שם.*פרטי/i,
      /^שמך\s*המלא$/i,
      /^שם\s*מלא$/i,
      /^שם\s*פרטי$/i,
      /^שם\s*משפחה$/i,
      /^שם\s*בעברית$/i,
      /^שם\s*באנגלית$/i,
      /^שם\s*מגיש\/ת\s*הבקשה$/i,
      /^שם\s*הפונה$/i,
      /שם/i  // תופס כל שדה שמכיל את המילה שם
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

  // Helper function to check if a string looks like a full name
  const isFullName = (str: string): boolean => {
    // נקה רווחים מיותרים
    const trimmed = str.trim();
    
    // בדוק שיש לפחות 2 מילים
    const words = trimmed.split(/\s+/);
    if (words.length < 2) return false;
    
    // בדוק שכל מילה מכילה רק אותיות בעברית או אנגלית
    return words.every(word => {
      // אותיות בעברית או אנגלית, מינימום 2 תווים למילה
      return word.length >= 2 && /^[\u0590-\u05FF\u200fa-zA-Z'"-]+$/.test(word);
    });
  };

  // Helper function to check if a string is a valid phone number
  const isPhoneNumber = (str: string): boolean => {
    // תבניות שונות של מספרי טלפון
    const patterns = [
      // פורמט עם סוגריים ומקפים: (054) 677-6329
      /^\(\d{2,3}\)\s*\d{3}[-\s]\d{4}$/,
      // פורמט עם מקפים: 054-677-6329
      /^\d{2,3}[-\s]\d{3}[-\s]\d{4}$/,
      // פורמט בינלאומי: +972546776329
      /^\+?(972|0)\d{9}$/,
      // פורמט רגיל: 0546776329
      /^0\d{8,9}$/,
      // פורמט עם רווחים: 054 677 6329
      /^\d{2,3}\s\d{3}\s\d{4}$/,
      // פורמט עם נקודות: 054.677.6329
      /^\d{2,3}\.\d{3}\.\d{4}$/,
      // פורמט בינלאומי עם מקף: +972-54-677-6329
      /^\+?(972|0)[-\s]?\d{1,2}[-\s]?\d{3}[-\s]?\d{4}$/,
      // פורמט עם סוגריים חלקי: 054-6776329
      /^\d{2,3}[-\s]\d{7}$/,
      // פורמט בינלאומי עם סוגריים: (+972) 54-677-6329
      /^\(\+?(972|0)\)\s*\d{1,2}[-\s]?\d{3}[-\s]?\d{4}$/,
      // פורמט עם קידומת בסוגריים: (054) 6776329
      /^\(\d{2,3}\)\s*\d{7}$/,
      // פורמט עם קידומת ארוכה: 0549876543
      /^0\d{9}$/,
      // פורמט בינלאומי נקי: 972549876543
      /^972\d{9}$/
    ];

    // נקה רווחים מיותרים
    const trimmed = str.trim();
    
    // בדוק אם המספר תואם לאחת התבניות
    if (patterns.some(pattern => pattern.test(trimmed))) {
      return true;
    }

    // אם לא תואם לתבניות, נקה את כל התווים המיוחדים ובדוק אם זה מספר תקין
    const cleaned = trimmed.replace(/[\s\-().+]/g, '');
    return /^(?:972|0)\d{9}$/.test(cleaned);
  };

  // Helper function to check if a string is a valid email
  const isEmail = (str: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim());
  };

  // First pass: Find email and phone by format in ALL values
  const searchAllValues = (obj: any) => {
    if (!obj) return;

    if (typeof obj === 'string') {
      const value = obj.trim();
      // Find email by format
      if (!customer.email && isEmail(value)) {
        customer.email = value;
        console.log('Found email by format:', value);
      }
      // Find phone by format
      if (!customer.phone && isPhoneNumber(value)) {
        customer.phone = normalizePhone(value);
        console.log('Found phone by format:', { original: value, cleaned: customer.phone });
      }
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach(item => searchAllValues(item));
      return;
    }

    if (typeof obj === 'object') {
      Object.values(obj).forEach(value => searchAllValues(value));
    }
  };

  // Search all values first
  searchAllValues(formData);
  console.log('After searching all values:', { 
    foundEmail: !!customer.email, 
    foundPhone: !!customer.phone 
  });

  // בדיקת שדה pretty
  if (formData.pretty && typeof formData.pretty === 'string') {
    console.log('Found pretty field:', formData.pretty);
    const fields = formData.pretty.split(',').map((field: string) => field.trim());
    console.log('Split pretty fields:', fields);
    
    for (const field of fields) {
      // מוצאים את המיקום של הנקודתיים האחרונות בשדה
      const lastColonIndex = field.lastIndexOf(':');
      if (lastColonIndex === -1) {
        console.log('No colon found in field:', field);
        continue;
      }

      const key = field.substring(0, lastColonIndex);
      const value = field.substring(lastColonIndex + 1);
      
      if (!key || !value) {
        console.log('Empty key or value:', { key, value });
        continue;
      }

      // Clean the key by removing leading/trailing colons and whitespace
      const cleanKey = key.replace(/^:+|:+$/g, '').trim();
      console.log('Processing pretty field:', { cleanKey, value });

      if (cleanKey === 'שמך המלא' || cleanKey === 'שם מלא') {
        customer.name = value.trim();
        console.log('Found name in pretty:', value);
      }
      // Only set email/phone if not found by format
      else if (!customer.email && (cleanKey === 'אימייל' || cleanKey === 'אימייל אליו נשלח את מסמך הסיכום שלנו')) {
        customer.email = value.trim();
        console.log('Found email in pretty:', value);
      }
      else if (!customer.phone && (cleanKey === 'מספר טלפון' || cleanKey === 'טלפון נייד')) {
        const rawPhone = value.replace(/[^\d+]/g, '');
        customer.phone = normalizePhone(rawPhone);
        console.log('Found phone in pretty:', { original: value, cleaned: customer.phone });
      }
    }

    console.log('Extracted customer details from pretty:', customer);
    
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
  }

  // Second pass: Find fields by patterns if not found
  Object.entries(formData).forEach(([key, value]) => {
    if (typeof value !== 'string' || !value.trim()) return;

    Object.entries(patterns).forEach(([field, fieldPatterns]) => {
      if (!customer[field as keyof typeof customer]) {
        const matches = fieldPatterns.some(pattern => pattern.test(key));
        if (matches) {
          // Only validate name (email and phone already validated)
          if (field === 'name' && isFullName(value)) {
            customer[field as keyof typeof customer] = value.trim();
          }
        }
      }
    });
  });

  // Third pass: Find name by proximity if still missing
  if (!customer.name) {
    const entries = Object.entries(formData);
    
    entries.forEach(([_, value], index) => {
      if (typeof value !== 'string' || !value.trim()) return;
      const valueStr = value.trim();

      // If we found email by format, look for name in adjacent fields
      if (customer.email && !customer.name) {
        // Look for name in adjacent fields (before and after)
        for (let i = Math.max(0, index - 2); i <= Math.min(entries.length - 1, index + 2); i++) {
          const [_, adjacentValue] = entries[i];
          if (typeof adjacentValue === 'string' && isFullName(adjacentValue)) {
            customer.name = adjacentValue.trim();
            break;
          }
        }
      }

      // Find name by format if not found
      if (!customer.name && isFullName(valueStr)) {
        customer.name = valueStr;
      }
    });
  }

  console.log('Final customer details:', customer);
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

// Preprocessing webhook interfaces
export interface PreprocessingWebhookRequest {
  submission: {
    id: string;
    form_id: string;
    created_at: string;
  };
  content: {
    form_data: any;
    transcriptions?: Array<{
      fieldName: string;
      transcription: string;
      questionLabel?: string;
    }>;
    pretty?: string;
    [key: string]: any;
  };
  template: {
    id: string;
    name: string;
  };
}

export interface PreprocessingWebhookResponse {
  content: {
    form_data: any;
    [key: string]: any;
  };
  error?: string;
  skip_processing?: boolean;
}

export async function sendPreprocessingWebhook(
  submissionId: string,
  webhookUrl: string
): Promise<PreprocessingWebhookResponse> {
  console.log('🔄 Starting preprocessing webhook for submission:', submissionId);

  // Get submission with template data
  const { data: submission, error: submissionError } = await supabaseAdmin
    .from('form_submissions')
    .select(`
      *,
      templates:form_id (
        id,
        name
      )
    `)
    .eq('submission_id', submissionId)
    .single();

  if (submissionError || !submission) {
    console.error('❌ Failed to fetch submission:', submissionError);
    throw new Error(`Failed to fetch submission: ${submissionError?.message}`);
  }

  // Log original form data
  console.log('📝 Original form data:', {
    form_data: submission.content?.form_data,
    pretty: submission.content?.pretty,
    transcriptions: submission.content?.transcriptions?.length
  });

  const payload: PreprocessingWebhookRequest = {
    submission: {
      id: submission.submission_id,
      form_id: submission.form_id,
      created_at: submission.created_at
    },
    content: submission.content || {},
    template: {
      id: submission.templates.id,
      name: submission.templates.name
    }
  };

  try {
    console.log('📤 Sending preprocessing webhook request to:', webhookUrl);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      throw new Error(`Webhook failed with status ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Validate response structure
    if (!data.content || typeof data.content !== 'object') {
      throw new Error('Invalid webhook response: missing or invalid content object');
    }

    // Log the received data
    console.log('📥 Received webhook response:', {
      form_data: data.content.form_data,
      pretty: data.content.pretty,
      skip_processing: data.skip_processing
    });

    // Update pretty field if form_data was modified
    if (data.content.form_data && submission.content?.pretty) {
      const originalPretty = submission.content.pretty;
      let updatedPretty = originalPretty;

      // Update each value in pretty that was modified in form_data
      Object.entries(data.content.form_data).forEach(([key, newValue]) => {
        const originalValue = submission.content?.form_data?.[key];
        if (originalValue && originalValue !== newValue) {
          // Escape special characters in the original value for regex
          const escapedOriginal = originalValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const pattern = new RegExp(`(.*?:)${escapedOriginal}(,|$)`);
          updatedPretty = updatedPretty.replace(pattern, `$1${newValue}$2`);
        }
      });

      // Add the updated pretty field to response
      data.content.pretty = updatedPretty;

      // Log pretty field changes
      console.log('📝 Pretty field update:', {
        original: originalPretty,
        updated: updatedPretty,
        changed: originalPretty !== updatedPretty
      });
    }

    console.log('✅ Preprocessing webhook completed successfully');
    return data;

  } catch (error) {
    console.error('❌ Preprocessing webhook failed:', error);
    throw new Error(`Preprocessing webhook failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
} 