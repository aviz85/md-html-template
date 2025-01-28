import { supabaseAdmin } from './supabase-admin';

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || '';
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || '';
const MAILGUN_API_URL = process.env.MAILGUN_EU_DOMAIN === 'true' 
  ? 'https://api.eu.mailgun.net/v3'
  : 'https://api.mailgun.net/v3';

export interface EmailConfig {
  to: string;
  from: string;
  subject: string;
  html: string;
  submissionId?: string;
  tracking?: {
    opens?: boolean;
    clicks?: boolean;
  };
  deliveryTime?: Date;
  tags?: string[];
}

export function findEmailInFormData(formData: any): string | null {
  // Simple email regex pattern
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

  // Helper function to recursively search for email in object
  function findEmailInObject(obj: any): string | null {
    if (!obj) return null;

    // If string - check if it's an email
    if (typeof obj === 'string') {
      const match = obj.match(emailRegex);
      if (match) return match[0];
      return null;
    }

    // If array - search in each element
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const email = findEmailInObject(item);
        if (email) return email;
      }
      return null;
    }

    // If object - search in all values
    if (typeof obj === 'object') {
      // Common email field names to check first
      const commonEmailFields = ['email', 'mail', 'e-mail', 'emailAddress', 'JJ'];
      
      // First check common email fields
      for (const field of commonEmailFields) {
        if (obj[field]) {
          const email = findEmailInObject(obj[field]);
          if (email) return email;
        }
      }

      // Then check all other fields
      for (const key in obj) {
        // Skip if we already checked this field
        if (commonEmailFields.includes(key)) continue;
        
        const email = findEmailInObject(obj[key]);
        if (email) return email;
      }
    }

    return null;
  }

  console.log('🔍 Searching for email in form data');
  const email = findEmailInObject(formData);
  if (email) {
    console.log('✉️ Found email:', email);
  } else {
    console.log('❌ No email found in form data');
  }
  
  return email;
}

export const replaceVariables = (template: string, data: any): string => {
  // Add submission and form data with clean references
  const cleanData = {
    ...data,
    id: data.submission?.id,
    form_id: data.submission?.form_id,
    created_at: data.submission?.created_at,
  };

  // First handle conditionals
  template = template.replace(/\{\{if\s+([^}]+)\}\}(.*?)\{\{else\}\}(.*?)\{\{endif\}\}/g, (match, condition, ifContent, elseContent) => {
    try {
      const [field, value] = condition.split('===').map((s: string) => s.trim());
      const fieldValue = field.split('.').reduce((obj: any, key: string) => obj?.[key], cleanData);
      return fieldValue === value.replace(/['"]/g, '') ? ifContent : elseContent;
    } catch (error) {
      console.error('Error processing condition:', error);
      return match;
    }
  });

  // Then handle simple variables
  return template.replace(/\{\{(.*?)\}\}/g, (match, key) => {
    const path = key.trim().split('.');
    let value = cleanData;
    for (const segment of path) {
      value = value?.[segment];
      if (value === undefined) return match;
    }
    return value?.toString() || match;
  });
};

export async function sendEmail(config: EmailConfig) {
  console.log('[Email Service] Starting to send email:', {
    to: config.to,
    from: config.from,
    subject: config.subject,
    submissionId: config.submissionId,
  });

  try {
    // Prepare form data
    const formData = new URLSearchParams();
    formData.append('from', config.from);
    formData.append('to', config.to);
    formData.append('subject', config.subject);
    formData.append('html', config.html);
    
    if (config.tracking?.opens) formData.append('o:tracking-opens', 'yes');
    if (config.tracking?.clicks) formData.append('o:tracking-clicks', 'yes');
    if (config.deliveryTime) formData.append('o:deliverytime', config.deliveryTime.toUTCString());
    if (config.tags) config.tags.forEach(tag => formData.append('o:tag', tag));

    const mailgunUrl = `${MAILGUN_API_URL}/${MAILGUN_DOMAIN}/messages`;
    
    // Log full configuration for debugging
    console.log('[Email Service] Configuration:', {
      url: mailgunUrl,
      domain: MAILGUN_DOMAIN,
      apiKeyPresent: !!MAILGUN_API_KEY,
      formData: Object.fromEntries(formData),
    });

    const response = await fetch(mailgunUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString()
    });

    // Clone the response before reading it
    const responseClone = response.clone();

    let responseData;
    try {
      responseData = await response.json();
    } catch {
      // If JSON parsing fails, use the cloned response to get text
      const text = await responseClone.text();
      responseData = { message: text };
    }

    console.log('[Email Service] Mailgun response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      data: responseData
    });

    if (!response.ok) {
      throw new Error(
        responseData.message || 
        `Failed to send email: ${response.status} ${response.statusText}`
      );
    }

    if (config.submissionId) {
      await supabaseAdmin
        .from('form_submissions')
        .update({
          email_status: 'sent',
          email_sent_at: new Date().toISOString(),
          recipient_email: config.to
        })
        .eq('submission_id', config.submissionId);
    }

    return responseData;
  } catch (error) {
    console.error('[Email Service] Error:', error);
    
    if (config.submissionId) {
      await supabaseAdmin
        .from('form_submissions')
        .update({
          email_status: 'error',
          email_error: error instanceof Error ? error.message : 'Unknown error'
        })
        .eq('submission_id', config.submissionId);
    }
    throw error;
  }
} 