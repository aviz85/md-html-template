export interface SubmissionStatus {
  submission_id: string;
  status: string;
  email_status: string;
  created_at: string;
  updated_at: string;
  progress?: {
    stage: string;
    message: string;
    timestamp?: string;
    details?: any;
  };
  email_error?: string;
  email_sent_at?: string;
  recipient_email?: string;
  result?: any;
  logs?: Array<{
    stage: string;
    message: string;
    timestamp: string;
    details?: any;
  }>;
  content?: {
    parsedRequest?: Record<string, string>;
    pretty?: string;
    email_subject?: string;
    email_body?: string;
    email_from?: string;
    email_to?: string;
    whatsapp_message?: string;
  };
  whatsapp_status?: string;
  whatsapp_error?: string;
  whatsapp_sent_at?: string;
  recipient_phone?: string;
  claude_status?: string;
  has_audio?: boolean;
  transcription_status?: string;
  processing_duration?: number;
  form_id?: string;
} 