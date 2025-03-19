export interface ElementStyle {
  color?: string
  backgroundColor?: string
  fontSize?: string
  margin?: string
  padding?: string
  fontFamily?: string
  textAlign?: 'right' | 'left' | 'center'
  customCss?: string
  logoWidth?: string
  logoHeight?: string
  logoPosition?: 'top-right' | 'top-left' | 'top-center' | 'center-right' | 'center-left' | 'center' | 'bottom-right' | 'bottom-left' | 'bottom-center'
  logoMargin?: string
  showLogo?: boolean
  showLogoOnAllPages?: boolean
}

export type LogoPosition = 'top-right' | 'top-left' | 'top-center' | 'center-right' | 'center-left' | 'center' | 'bottom-right' | 'bottom-left' | 'bottom-center'

export type ElementType = "body" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "list" | "p" | "specialParagraph" | "header" | "footer" | "main" | "prose"

export interface CustomContent {
  name: string
  content: string
}

export type CustomFont = {
  name: string;
  font_family: string;
  file_path: string;
  format: string;
  weight_range?: number[];
  has_italic?: boolean;
  font_display?: string;
};

export interface TemplateStyles {
  bodyBackground?: string
  mainBackground?: string
  contentBackground?: string
}

export interface Template {
  id?: string
  name: string
  elementStyles: Record<ElementType, ElementStyle>
  template_gsheets_id?: string
  header_content?: string
  footer_content?: string
  opening_page_content?: string
  closing_page_content?: string
  logo_path?: string
  custom_contents?: Array<CustomContent>
  custom_fonts?: Array<CustomFont>
  form_id?: string
  styles?: TemplateStyles
  email_subject?: string
  email_body?: string
  email_from?: string
  send_email?: boolean
  webhook_url?: string
  send_whatsapp?: boolean
  whatsapp_message?: string
  preprocessing_webhook_url?: string
  use_optimized_prompting?: boolean
  allow_single_email_submission?: boolean
}

export interface MediaFile {
  name: string
  url: string
  type: string
  created_at: string
  file_path?: string
}

export interface ValidationResult {
  isValid: boolean
  error?: string
}

export interface TemplateContextType {
  template: Template | null
  setTemplate: React.Dispatch<React.SetStateAction<Template | null>>
  elementStyles: Template["elementStyles"]
  setElementStyles: React.Dispatch<React.SetStateAction<Template["elementStyles"]>>
  activeElement: ElementType
  setActiveElement: React.Dispatch<React.SetStateAction<ElementType>>
  previewHtml: string
  setPreviewHtml: React.Dispatch<React.SetStateAction<string>>
  isLoading: boolean
  saveTemplate: () => Promise<void>
  generatePreview: () => Promise<void>
}

export interface TemplateEditorProps {
  templateId?: string
  onSave?: () => void
}

export interface ResizableSplitterProps {
  onResize: (width: number) => void
}

export interface StyleChangeParams {
  elementType: string
  style: any
}

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
