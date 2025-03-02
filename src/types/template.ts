import { ElementStyle, ElementType } from "./index"

// No longer need to define ElementType here as it's imported from index.ts

export interface CustomContent {
  name: string
  content: string
}

export interface CustomFont {
  name: string
  file_path: string
  font_family: string
  format: string
}

export interface TemplateStyles {
  bodyBackground?: string
  mainBackground?: string
  contentBackground?: string
}

export interface Template {
  id: string
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
} 