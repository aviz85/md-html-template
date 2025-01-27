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

export const findEmailInFormData = (formData: any): string | null => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  // Recursively search through object
  const searchForEmail = (obj: any): string | null => {
    for (const key in obj) {
      const value = obj[key];
      
      if (typeof value === 'string' && emailRegex.test(value)) {
        return value;
      }
      
      if (typeof value === 'object' && value !== null) {
        const found = searchForEmail(value);
        if (found) return found;
      }
    }
    return null;
  };

  return searchForEmail(formData);
};

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
  try {
    // Prepare form data
    const formData = new URLSearchParams();
    formData.append('from', config.from);
    formData.append('to', config.to);
    formData.append('subject', config.subject);
    formData.append('html', config.html);
    
    // Add tracking if specified
    if (config.tracking?.opens) {
      formData.append('o:tracking-opens', 'yes');
    }
    if (config.tracking?.clicks) {
      formData.append('o:tracking-clicks', 'yes');
    }

    // Add delivery time if specified
    if (config.deliveryTime) {
      formData.append('o:deliverytime', config.deliveryTime.toUTCString());
    }

    // Add tags if specified
    if (config.tags) {
      config.tags.forEach(tag => formData.append('o:tag', tag));
    }

    // Send request to Mailgun
    const response = await fetch(`${MAILGUN_API_URL}/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString()
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to send email');
    }

    const result = await response.json();

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

    return result;
  } catch (error) {
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