"use client"

import React, { useState, useEffect, useRef } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { StyleEditor } from "@/components/style-editor"
import { useToast } from "@/hooks/use-toast"
import { marked } from 'marked'
import { 
  extractUsedFonts, 
  generateGoogleFontsUrl, 
  generateHtmlTemplate,
  toKebabCase,
  toCamelCase,
  CSS_PROPERTIES,
  convertMarkdownToHtml,
  configureMarked
} from "@/lib/constants"
import { TRANSLATIONS } from "@/lib/translations"
import { supabase } from "@/lib/supabase-client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog"
import { Upload, Trash2, ImageIcon, HelpCircle } from "lucide-react"
import { Label } from "@/components/ui/label"
import { ColorPicker } from "@/components/ui/color-picker"
import { format } from 'date-fns'
import { EmailEditor } from './email-editor'
import { ElementStyle, LogoPosition, CustomFont } from "@/types"

type ElementType = "body" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "list" | "p" | "specialParagraph" | "header" | "footer" | "main" | "prose"

interface Template {
  id: string
  name: string
  elementStyles: Record<ElementType, ElementStyle>
  template_gsheets_id?: string
  header_content?: string
  footer_content?: string
  opening_page_content?: string
  closing_page_content?: string
  logo_path?: string
  custom_contents?: Array<{
    name: string
    content: string
  }>
  custom_fonts?: Array<{
    name: string
    file_path: string
    font_family: string
    format: string
  }>
  form_id?: string
  styles?: {
    bodyBackground?: string
    mainBackground?: string
    contentBackground?: string
  }
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

interface SubmissionStatus {
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

interface TemplateEditorProps {
  templateId?: string
  onSave?: () => void
}

function ResizableSplitter({ onResize }: { onResize: (width: number) => void }) {
  const splitterRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return
      
      const dx = e.clientX - startXRef.current
      const newWidth = Math.max(150, Math.min(400, startWidthRef.current + dx))
      onResize(newWidth)
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
      document.body.style.cursor = 'default'
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [onResize])

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true
    startXRef.current = e.clientX
    startWidthRef.current = splitterRef.current?.previousElementSibling?.getBoundingClientRect().width || 0
    document.body.style.cursor = 'col-resize'
  }

  return (
    <div
      ref={splitterRef}
      className="w-1 bg-border hover:bg-primary cursor-col-resize"
      onMouseDown={handleMouseDown}
    />
  )
}

export function TemplateEditor({ templateId, onSave }: TemplateEditorProps) {
  const { toast } = useToast()
  const [mdContent, setMdContent] = useState("")
  const [headerContent, setHeaderContent] = useState("")
  const [footerContent, setFooterContent] = useState("")
  const [previewHtml, setPreviewHtml] = useState("")
  const [activeElement, setActiveElement] = useState<ElementType>("body")
  const [templateName, setTemplateName] = useState("")
  const [templateGsheetsId, setTemplateGsheetsId] = useState("")
  const [formId, setFormId] = useState<string>("")
  const [fontName, setFontName] = useState("")
  const [fontFile, setFontFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [customFonts, setCustomFonts] = useState<Template['custom_fonts']>([])
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [styles, setStyles] = useState<Template['styles']>({
    bodyBackground: '#ffffff',
    mainBackground: '#ffffff',
    contentBackground: '#ffffff'
  })
  const [elementStyles, setElementStyles] = useState<Template["elementStyles"]>({
    body: {},
    h1: {},
    h2: {},
    h3: {},
    h4: {},
    h5: {},
    h6: {},
    list: {},
    p: {},
    specialParagraph: {},
    header: {
      showLogo: true,
      logoWidth: '100px',
      logoHeight: 'auto',
      logoMargin: '1rem',
      logoPosition: 'top-right',
    },
    footer: {},
    main: {},
    prose: {}
  })
  const [sidebarWidth, setSidebarWidth] = useState(200)
  const [openingPageContent, setOpeningPageContent] = useState("")
  const [closingPageContent, setClosingPageContent] = useState("")
  const [customContents, setCustomContents] = useState<{ name: string; content: string }[]>([])
  const [logoPath, setLogoPath] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false)
  const [emailSubject, setEmailSubject] = useState("")
  const [emailBody, setEmailBody] = useState("")
  const [emailFrom, setEmailFrom] = useState("")
  const [recentSubmissions, setRecentSubmissions] = useState<SubmissionStatus[]>([])
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false)
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionStatus | null>(null)
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false)
  const [mediaFiles, setMediaFiles] = useState<FileList | null>(null)
  const [uploadedMediaUrls, setUploadedMediaUrls] = useState<string[]>([])
  const [isMediaUploading, setIsMediaUploading] = useState(false)
  const [showMediaInstructions, setShowMediaInstructions] = useState(false)
  const [template, setTemplate] = useState<Template | null>(null)
  const [sendEmail, setSendEmail] = useState(true)
  const [webhookUrl, setWebhookUrl] = useState("")
  const [sendWhatsapp, setSendWhatsapp] = useState(false)
  const [whatsappMessage, setWhatsappMessage] = useState("")

  useEffect(() => {
    if (templateId) {
      loadTemplate(templateId)
    }
  }, [templateId])

  useEffect(() => {
    if (templateId) {
      const loadMedia = async () => {
        const { data, error } = await supabase
          .from('media_files')
          .select('file_path')
          .eq('template_id', templateId);
        
        if (!error && data) {
          const urls = data.map(file => {
            const { data: { publicUrl } } = supabase.storage
              .from('storage')
              .getPublicUrl(file.file_path);
            return publicUrl;
          });
          setUploadedMediaUrls(urls);
        }
      };
      
      loadMedia();
    }
  }, [templateId]);

  // Load template data including fonts
  useEffect(() => {
    const loadTemplateData = async () => {
      if (!templateId) return;
      
      // Load template fonts
      const { data: fonts, error } = await supabase
        .from('custom_fonts')
        .select('*')
        .eq('template_id', templateId)
        .order('created_at', { ascending: false });
        
      if (!error && fonts) {
        setCustomFonts(fonts);
      } else if (error) {
        console.error('Error loading template fonts:', error);
      }
    };
    
    loadTemplateData();
  }, [templateId]);

  // Update template with new fonts
  const updateTemplateWithFonts = async (fonts: CustomFont[]) => {
    if (!templateId) return;

    const { error } = await supabase
      .from('templates')
      .update({ custom_fonts: fonts })
      .eq('id', templateId);
      
    if (error) {
      console.error('Failed to update template fonts:', error);
      toast({
        variant: "destructive",
        title: TRANSLATIONS.error,
        description: "Failed to update template fonts"
      });
    }
  };

  const parseCSS = (css: string) => {
    const styles: Template["elementStyles"] = {
      body: {},
      h1: {},
      h2: {},
      h3: {},
      h4: {},
      h5: {},
      h6: {},
      list: {},
      p: {},
      specialParagraph: {},
      header: {},
      footer: {},
      main: {},
      prose: {}
    }

    // Split CSS into rules
    const rules = css.split('}')
    
    rules.forEach(rule => {
      // Find selector and properties
      const [selector, ...properties] = rule.split('{')
      if (!selector || !properties.length) return

      const cleanSelector = selector.trim()
      const elementName = cleanSelector === '.special-paragraph' ? 'specialParagraph' : 
                         cleanSelector === '.header' ? 'header' :
                         cleanSelector === '.footer' ? 'footer' :
                         cleanSelector === 'body' ? 'body' : 
                         cleanSelector === 'p' ? 'p' : cleanSelector

      if (elementName in styles) {
        // Parse properties
        const props = properties[0].split(';')
        props.forEach(prop => {
          const [key, value] = prop.split(':').map(s => s.trim())
          if (key && value) {
            // Convert kebab-case to camelCase
            const camelKey = toCamelCase(key)
            if (isValidStyleProperty(camelKey)) {
              if (camelKey === 'textAlign' && !['right', 'left', 'center', 'justify'].includes(value)) {
                return
              }
              styles[elementName as ElementType][camelKey as keyof ElementStyle] = value as any
            }
          }
        })
      }
    })

    return styles
  }

  const isValidStyleProperty = (prop: string): prop is keyof ElementStyle => {
    return prop in CSS_PROPERTIES
  }

  const handleFontUpload = async () => {
    // Validate font name
    if (!fontName?.trim()) {
      toast({
        variant: "destructive",
        title: TRANSLATIONS.error,
        description: TRANSLATIONS.pleaseEnterFontName
      })
      return
    }

    // Check font name characters
    if (!/^[a-zA-Z0-9-]+$/.test(fontName)) {
      toast({
        variant: "destructive",
        title: TRANSLATIONS.error,
        description: TRANSLATIONS.invalidFontNameChars
      })
      return
    }

    if (!fontFile || !templateId) {
      toast({
        variant: "destructive",
        title: TRANSLATIONS.error,
        description: TRANSLATIONS.pleaseEnterFontName
      })
      return
    }

    // Check file size (2MB limit)
    if (fontFile.size > 2 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: TRANSLATIONS.error,
        description: TRANSLATIONS.fontTooLarge
      })
      return
    }

    // Validate file extension
    const fileExt = fontFile.name.split('.').pop()?.toLowerCase()
    if (!fileExt || !['woff2', 'woff', 'ttf', 'otf'].includes(fileExt)) {
      toast({
        variant: "destructive",
        title: TRANSLATIONS.error,
        description: TRANSLATIONS.invalidFontFile
      })
      return
    }

    setIsUploading(true)
    try {
      // Convert file to base64
      const fileData = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.readAsArrayBuffer(fontFile)
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
      })

      // Upload font via API
      const response = await fetch('/api/fonts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateId,
          fontName,
          fileExt,
          fileData: Array.from(new Uint8Array(fileData as ArrayBuffer))
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to upload font')
      }

      const { fonts } = await response.json()
      setCustomFonts(fonts || [])

      // Update template with new fonts
      await updateTemplateWithFonts(fonts || [])

      toast({
        title: TRANSLATIONS.success,
        description: TRANSLATIONS.uploadFontSuccess
      })

      // Reset form and close dialog
      setFontName("")
      setFontFile(null)
      setIsUploadDialogOpen(false)
    } catch (error) {
      console.error('Error uploading font:', error)
      toast({
        variant: "destructive",
        title: TRANSLATIONS.error,
        description: error instanceof Error && error.message === 'Failed to fetch' 
          ? TRANSLATIONS.networkError 
          : TRANSLATIONS.uploadFontError
      })
    } finally {
      setIsUploading(false)
    }
  }

  const loadTemplate = async (id: string) => {
    try {
      console.log('🔄 Starting template load process for ID:', id);
      
      // איפוס התוכן בתחילת הפונקציה
      setHeaderContent("")
      setFooterContent("")
      setOpeningPageContent("")
      setClosingPageContent("")
      setCustomContents([])
      
      const { data: template, error } = await supabase
        .from('templates')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      console.log('📋 Loaded template base data:', template);
      
      if (template) {
        setTemplateName(template.name || "")
        setTemplateGsheetsId(template.template_gsheets_id || "")
        setHeaderContent(template.header_content || "")
        setFooterContent(template.footer_content || "")
        setOpeningPageContent(template.opening_page_content || "")
        setClosingPageContent(template.closing_page_content || "")
        setFormId(template.form_id || "")
        setEmailSubject(template.email_subject || "")
        setEmailBody(template.email_body || "")
        setEmailFrom(template.email_from || "")
        setSendEmail(template.send_email ?? true)
        setWebhookUrl(template.webhook_url || "")
        setSendWhatsapp(template.send_whatsapp ?? false)
        setWhatsappMessage(template.whatsapp_message || "")
        setTemplate({
          ...template,
          preprocessing_webhook_url: template.preprocessing_webhook_url || "",
          use_optimized_prompting: template.use_optimized_prompting || false
        })
        
        setElementStyles(template.element_styles || {
          body: {
            backgroundColor: template.styles?.bodyBackground || '#ffffff'
          },
          h1: {},
          h2: {},
          h3: {},
          h4: {},
          h5: {},
          h6: {},
          list: {},
          p: {},
          specialParagraph: {},
          header: {
            showLogo: true,
            logoWidth: '100px',
            logoHeight: 'auto',
            logoMargin: '1rem',
            logoPosition: 'top-right',
          },
          footer: {},
          main: {},
          prose: {}
        })
        
        // Load logo
        const { data: logoData } = await supabase
          .from('logos')
          .select('file_path')
          .eq('template_id', id)
          .single()

        if (logoData) {
          setLogoPath(logoData.file_path)
        } else {
          setLogoPath(null)
        }
        
        // Load media files
        const { data: mediaFiles, error: mediaError } = await supabase
          .from('media_files')
          .select('file_path')
          .eq('template_id', id)
          .order('created_at', { ascending: false })

        if (mediaError) {
          console.error('Error loading media files:', mediaError)
        } else if (mediaFiles) {
          const urls = mediaFiles.map(file => {
            const { data: { publicUrl } } = supabase.storage
              .from('storage')
              .getPublicUrl(file.file_path)
            return publicUrl
          })
          setUploadedMediaUrls(urls)
        } else {
          setUploadedMediaUrls([])
        }
        
        // Load template contents with more detailed logging
        console.log('🔄 Fetching template contents for template ID:', id);
        const { data: contentsData, error: contentsError } = await supabase
          .from('template_contents')
          .select('*')
          .eq('template_id', id);

        // בדיקת שגיאות מפורטת יותר
        if (contentsError) {
          console.error('❌ Error loading template contents:', {
            error: contentsError,
            code: contentsError.code,
            message: contentsError.message,
            details: contentsError.details,
            hint: contentsError.hint
          });
          throw contentsError;
        }

        // בדיקת הנתונים שחזרו
        console.log('📦 Raw template contents query:', {
          table: 'template_contents',
          templateId: id,
          resultCount: contentsData?.length || 0,
          fullResult: contentsData,
          firstItem: contentsData?.[0]
        });

        // בדיקה האם יש נתונים בכלל
        if (!contentsData || contentsData.length === 0) {
          console.warn('⚠️ No contents found for template ID:', id);
        }

        if (!contentsError && contentsData) {
          // Create a Map to store unique contents
          const customContentMap = new Map();
          
          console.log('🔄 Processing template contents...');
          contentsData.forEach(content => {
            console.log(`📄 Processing content:`, {
              name: content.content_name,
              id: content.id,
              contentLength: content.md_content?.length || 0,
              firstChars: content.md_content?.substring(0, 50),
              created_at: content.created_at
            });

            if (content.content_name === 'header') {
              console.log('📝 Setting header content');
              setHeaderContent(content.md_content)
            } else if (content.content_name === 'footer') {
              console.log('📝 Setting footer content');
              setFooterContent(content.md_content)
            } else if (content.content_name === 'opening_page') {
              console.log('📝 Setting opening page content');
              setOpeningPageContent(content.md_content)
            } else if (content.content_name === 'closing_page') {
              console.log('📝 Setting closing page content');
              setClosingPageContent(content.md_content)
            } else if (content.content_name.startsWith('custom_')) {
              const name = content.content_name.replace('custom_', '')
              console.log(`📝 Adding custom content: ${name}`);
              // Use Map to ensure uniqueness
              customContentMap.set(name, {
                name,
                content: content.md_content
              })
            }
          })
          
          // Convert Map values to array and set state
          const customContentsArray = Array.from(customContentMap.values())
          console.log('📦 Final custom contents:', customContentsArray);
          setCustomContents(customContentsArray)
        }

        console.log('✅ Template contents load complete');

        setFormId(template.form_id || '')
        setStyles({
          bodyBackground: template.element_styles?.body?.backgroundColor || '#ffffff',
          mainBackground: template.element_styles?.main?.backgroundColor || '#ffffff',
          contentBackground: template.element_styles?.prose?.backgroundColor || '#ffffff'
        })

        setEmailSubject(template.email_subject || "")
        setEmailBody(template.email_body || "")
        setEmailFrom(template.email_from || "")
      }
    } catch (error) {
      console.error('❌ Error in loadTemplate:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load template"
      })
    }
  }

  const handleStyleChange = (style: ElementStyle) => {
    setElementStyles(prev => ({
      ...prev,
      [activeElement]: style
    }))

    // Sync bodyBackground with body backgroundColor when body is being edited
    if (activeElement === "body" && style.backgroundColor !== undefined) {
      setStyles(prev => ({
        ...prev,
        bodyBackground: style.backgroundColor
      }))
    }
  }

  const validateStyles = (styles: Template["elementStyles"]) => {
    const validationErrors: string[] = []

    Object.entries(styles).forEach(([element, style]) => {
      Object.entries(style).forEach(([prop, value]) => {
        if (!value) return

        switch (prop) {
          case 'fontSize':
            if (!/^(\d+(\.\d+)?(px|rem|em|%)|inherit)$/.test(value)) {
              validationErrors.push(`${element}: ${TRANSLATIONS.invalidFontSize}`)
            }
            break
          case 'margin':
          case 'padding':
            if (!/^(\d+(\.\d+)?(px|rem|em|%)|auto|inherit)$/.test(value)) {
              validationErrors.push(`${element}: ${TRANSLATIONS.invalidMarginPadding}`)
            }
            break
          case 'color':
            if (!/^(#[0-9A-Fa-f]{3,6}|rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\)|inherit|var\(--color[1-4]\))$/.test(value)) {
              validationErrors.push(`${element}: ${TRANSLATIONS.invalidColor}`)
            }
            break
        }
      })
    })

    return validationErrors
  }

  const generateCSS = (styles: Template["elementStyles"]) => {
    let css = ''
    
    // Add styles for each element
    Object.entries(styles).forEach(([element, styles]) => {
      if (Object.keys(styles).length === 0) return

      // Convert element name to CSS selector
      const selector = element === 'specialParagraph' ? '.special-paragraph' :
                      element === 'header' ? '.header' :
                      element === 'footer' ? '.footer' :
                      element

      css += `${selector} {\n`
      
      // Add custom CSS first if exists (will be overridden by standard properties)
      if (styles.customCss) {
        css += `  ${styles.customCss}\n`
      }
      
      // Add standard properties (these will override custom CSS)
      Object.entries(styles).forEach(([property, value]) => {
        if (!value || property === 'customCss') return // Skip empty values and customCss
        
        // Check if this is a valid CSS property
        const cssProperty = CSS_PROPERTIES[property as keyof typeof CSS_PROPERTIES]
        if (cssProperty) {
          css += `  ${cssProperty}: ${value};\n`
        }
      })
      
      css += '}\n\n'
    })
    
    return css
  }

  const validateFormId = (id: string): { isValid: boolean; error?: string } => {
    if (!id) return { isValid: true }; // Optional field
    
    // Check if alphanumeric - supporting both JotForm numeric IDs and Elementor alphanumeric IDs
    if (!/^[a-zA-Z0-9]+$/.test(id)) {
      return {
        isValid: false,
        error: 'מזהה טופס חייב להכיל רק אותיות באנגלית וספרות'
      };
    }
    
    // Allow for both JotForm IDs (usually 15 digits) and shorter Elementor IDs (around 7 chars)
    if (id.length < 5 || id.length > 16) {
      return {
        isValid: false,
        error: 'אורך מזהה טופס לא תקין (צריך להיות בין 5 ל-16 תווים)'
      };
    }
    
    return { isValid: true };
  };

  const validateGSheetsId = (id: string): { isValid: boolean; error?: string } => {
    if (!id) return { isValid: true }; // Optional field
    
    // Google Sheets ID format: alphanumeric with dashes and underscores
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return {
        isValid: false,
        error: 'מזהה Google Sheets יכול להכיל רק אותיות באנגלית, ספרות, מקף ותחתון'
      };
    }
    
    // Check minimum length
    if (id.length < 5) {
      return {
        isValid: false,
        error: 'מזהה Google Sheets קצר מדי'
      };
    }
    
    return { isValid: true };
  };

  const validateTemplateName = (name: string): { isValid: boolean; error?: string } => {
    if (!name) {
      return {
        isValid: false,
        error: 'שם תבנית הוא שדה חובה'
      };
    }
    
    if (name.length < 2) {
      return {
        isValid: false,
        error: 'שם תבנית חייב להכיל לפחות 2 תווים'
      };
    }
    
    if (name.length > 100) {
      return {
        isValid: false,
        error: 'שם תבנית ארוך מדי (מקסימום 100 תווים)'
      };
    }
    
    return { isValid: true };
  };

  const validateEmailAddress = (email: string): { isValid: boolean; error?: string } => {
    if (!email) return { isValid: true }; // Optional field
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        isValid: false,
        error: 'כתובת אימייל לא תקינה'
      };
    }
    
    return { isValid: true };
  };

  const handleSave = async () => {
    try {
      // Improved validation system with categorized warnings
      let hasValidationWarnings = false;
      const warningCategories: Record<string, string[]> = {
        nameIssues: [],
        formIssues: [],
        integrationIssues: [],
        contentIssues: [],
        styleIssues: [],
        emailIssues: [],
        whatsappIssues: [],
        generalIssues: []
      };
      
      // Validate template name
      const nameValidation = validateTemplateName(templateName);
      if (!nameValidation.isValid && nameValidation.error) {
        hasValidationWarnings = true;
        warningCategories.nameIssues.push(nameValidation.error);
      }
      
      // Validate Google Sheets ID if provided
      if (templateGsheetsId) {
        const gsheetsValidation = validateGSheetsId(templateGsheetsId);
        if (!gsheetsValidation.isValid && gsheetsValidation.error) {
          hasValidationWarnings = true;
          warningCategories.integrationIssues.push(`Google Sheets ID: ${gsheetsValidation.error}`);
        }
      }
      
      // Validate form ID if provided
      if (formId) {
        const formValidation = validateFormId(formId);
        if (!formValidation.isValid && formValidation.error) {
          hasValidationWarnings = true;
          warningCategories.formIssues.push(`Form ID: ${formValidation.error}`);
        }
      }
      
      // Validate email if send email is enabled
      if (sendEmail) {
        // Validate email address
        if (emailFrom) {
          const emailValidation = validateEmailAddress(emailFrom);
          if (!emailValidation.isValid && emailValidation.error) {
            hasValidationWarnings = true;
            warningCategories.emailIssues.push(`Email address: ${emailValidation.error}`);
          }
        }
        // Validate email subject
        if (!emailSubject || emailSubject.trim() === '') {
          hasValidationWarnings = true;
          warningCategories.emailIssues.push("Email subject is empty");
        }
        
        // Validate email body
        if (!emailBody || emailBody.trim() === '') {
          hasValidationWarnings = true;
          warningCategories.emailIssues.push("Email body is empty");
        }
      }
      
      // Validate whatsapp configuration
      if (sendWhatsapp) {
        if (!whatsappMessage || whatsappMessage.trim() === '') {
          hasValidationWarnings = true;
          warningCategories.whatsappIssues.push("WhatsApp message is empty");
        } else if (!whatsappMessage.includes("{{id}}")) {
          hasValidationWarnings = true;
          warningCategories.whatsappIssues.push("WhatsApp message doesn't contain the {{id}} placeholder");
        }
      }
      
      
      // Validate element styles
      const styleValidationErrors = validateStyles(elementStyles);
      if (styleValidationErrors.length > 0) {
        hasValidationWarnings = true;
        styleValidationErrors.forEach(error => {
          warningCategories.styleIssues.push(error);
        });
      }
      
      // Save template
      const { data: savedTemplate, error: templateError } = await supabase
        .from('templates')
        .upsert({
          id: templateId,
          name: templateName,
          template_gsheets_id: templateGsheetsId,
          element_styles: {
            ...elementStyles,
            main: {
              ...elementStyles.main,
              backgroundColor: styles?.mainBackground || '#ffffff'
            },
            prose: {
              ...elementStyles.prose,
              backgroundColor: styles?.contentBackground || '#ffffff'
            }
          },
          show_logo: elementStyles.header.showLogo !== false,
          show_logo_on_all_pages: elementStyles.header.showLogoOnAllPages !== false,
          logo_position: elementStyles.header.logoPosition || 'top-right',
          form_id: formId,
          email_subject: emailSubject,
          email_body: emailBody,
          email_from: emailFrom,
          send_email: sendEmail,
          webhook_url: webhookUrl,
          send_whatsapp: sendWhatsapp,
          whatsapp_message: whatsappMessage,
          preprocessing_webhook_url: template?.preprocessing_webhook_url || "",
          use_optimized_prompting: template?.use_optimized_prompting || false
        })
        .select()
        .single();

      if (templateError) throw templateError;

      // Delete all existing contents first
      const { error: deleteError } = await supabase
        .from('template_contents')
        .delete()
        .eq('template_id', savedTemplate.id)

      if (deleteError) throw deleteError

      // Prepare contents to insert
      const contents = []

      // Add header and footer if they exist
      if (headerContent) {
        contents.push({
          template_id: savedTemplate.id,
          content_name: 'header',
          md_content: headerContent
        })
      }

      if (footerContent) {
        contents.push({
          template_id: savedTemplate.id,
          content_name: 'footer',
          md_content: footerContent
        })
      }

      // Add opening and closing pages if they exist
      if (openingPageContent) {
        contents.push({
          template_id: savedTemplate.id,
          content_name: 'opening_page',
          md_content: openingPageContent
        })
      }

      if (closingPageContent) {
        contents.push({
          template_id: savedTemplate.id,
          content_name: 'closing_page',
          md_content: closingPageContent
        })
      }

      // Add custom contents if they exist
      customContents.forEach(content => {
        if (content.content) {
          contents.push({
            template_id: savedTemplate.id,
            content_name: `custom_${content.name}`,
            md_content: content.content
          })
        }
      })

      // Insert new contents if there are any
      if (contents.length > 0) {
        const { error: contentsError } = await supabase
          .from('template_contents')
          .insert(contents)

        if (contentsError) throw contentsError
      }

      // Show success toast with detailed warnings if applicable
      if (hasValidationWarnings) {
        // Format warning message with categories
        let formattedWarnings = TRANSLATIONS.templateHasWarnings || "התבנית נשמרה אך יש בה אזהרות:";
        
        // Add warnings by category
        Object.entries(warningCategories).forEach(([category, warnings]) => {
          if (warnings.length > 0) {
            const categoryTitle = getCategoryTitle(category);
            formattedWarnings += `\n\n${categoryTitle}:`;
            warnings.forEach(warning => {
              formattedWarnings += `\n• ${warning}`;
            });
          }
        });
        
        toast({
          variant: "default",
          title: TRANSLATIONS.templateSavedWithWarnings || "התבנית נשמרה עם אזהרות",
          description: formattedWarnings,
        });
      } else {
        toast({
          title: TRANSLATIONS.success,
          description: TRANSLATIONS.templateSavedSuccessfully
        });
      }

      if (onSave) {
        onSave();
      }
    } catch (error) {
      console.error('Error saving template:', error);
      
      // Enhanced error message
      let errorMessage: string = TRANSLATIONS.failedToSaveTemplate;
      
      // Extract specific error details if available
      if (error instanceof Error) {
        errorMessage = `${TRANSLATIONS.failedToSaveTemplate}: ${error.message}`;
        
        // Check for common database errors
        if (error.message.includes('unique constraint')) {
          errorMessage = TRANSLATIONS.duplicateTemplateName || 'Template name already exists. Please choose a different name.';
        } else if (error.message.includes('foreign key constraint')) {
          errorMessage = 'Referenced record not found. Please check your input data.';
        } else if (error.message.includes('not-null constraint')) {
          errorMessage = 'Missing required field. Please check all required fields are filled.';
        }
      }
      
      toast({
        variant: "destructive",
        title: TRANSLATIONS.error,
        description: errorMessage
      });
    }
  }

  // Helper function to get human-readable category titles
  const getCategoryTitle = (category: string): string => {
    switch (category) {
      case 'nameIssues': return 'שם התבנית';
      case 'formIssues': return 'בעיות בטופס';
      case 'integrationIssues': return 'בעיות באינטגרציה';
      case 'contentIssues': return 'בעיות בתוכן';
      case 'styleIssues': return 'בעיות בעיצוב';
      case 'emailIssues': return 'בעיות בהגדרות מייל';
      case 'whatsappIssues': return 'בעיות בהגדרות WhatsApp';
      case 'generalIssues': return 'בעיות כלליות';
      default: return category;
    }
  }

  const handlePreview = async () => {
    // Configure marked with central configuration
    configureMarked();
    
    // Validate template ID
    if (!templateId) {
      toast({
        variant: "destructive",
        title: TRANSLATIONS.error,
        description: TRANSLATIONS.previewNoTemplate
      })
      return
    }

    try {
      // Get logo URL if exists
      const logoUrl = getLogoPreviewUrl()
      const headerWithLogo = logoUrl ? `
        <div style="position: relative;">
          <img 
            src="${logoUrl}" 
            style="
              position: absolute; 
              ${(() => {
                switch(elementStyles.header.logoPosition) {
                  case 'top-left': return 'left: 0; top: 0;'
                  case 'top-center': return 'left: 50%; transform: translateX(-50%); top: 0;'
                  case 'top-right': return 'right: 0; top: 0;'
                  case 'bottom-left': return 'left: 0; bottom: 0;'
                  case 'bottom-center': return 'left: 50%; transform: translateX(-50%); bottom: 0;'
                  case 'bottom-right': return 'right: 0; bottom: 0;'
                  default: return 'right: 0; top: 0;'
                }
              })()}
              width: ${elementStyles.header.logoWidth || '100px'};
              height: ${elementStyles.header.logoHeight || 'auto'};
              object-fit: contain;
              margin: ${elementStyles.header.logoMargin || '1rem'};
            "
          />
          ${headerContent}
        </div>
      ` : headerContent

      console.log('Sending preview request with:', {
        markdowns: mdContent || '',
        template: {
          template_id: templateId,
          css: generateCSS(elementStyles),
          custom_fonts: customFonts
        },
        header_content: headerWithLogo,
        footer_content: footerContent,
        custom_contents: customContents
      })

      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          markdowns: mdContent || '',
          template: {
            template_id: templateId,
            css: generateCSS(elementStyles),
            custom_fonts: customFonts
          },
          header_content: headerWithLogo,
          footer_content: footerContent,
          custom_contents: customContents
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate preview')
      }

      const { htmls } = await response.json()
      console.log('Received preview HTML:', htmls)
      setPreviewHtml(htmls)
    } catch (error) {
      console.error('Error generating preview:', error)
      toast({
        variant: "destructive",
        title: TRANSLATIONS.error,
        description: error instanceof Error && error.message === 'Failed to fetch' 
          ? TRANSLATIONS.networkError 
          : TRANSLATIONS.failedToSaveTemplate
      })
    }
  }

  const handleAddCustomContent = () => {
    // מציאת המספר הבא הפנוי
    const existingNumbers = customContents
      .map(c => {
        const match = c.name.match(/^custom(\d+)$/)
        return match ? parseInt(match[1]) : 0
      })
      .filter(n => !isNaN(n))
    
    const nextNumber = existingNumbers.length > 0 
      ? Math.max(...existingNumbers) + 1 
      : 1

    const newContent = { name: `custom${nextNumber}`, content: '' }
    setCustomContents(prev => [...prev, newContent])
  }

  const handleCustomContentChange = (index: number, field: 'name' | 'content', value: string) => {
    setCustomContents(prev => {
      const newContents = [...prev]
      if (field === 'name') {
        // בידוא שהשם החדש מכיל רק אותיות באנגלית ומספרים
        if (!/^[A-Za-z0-9]+$/.test(value)) {
          toast({
            variant: "destructive",
            title: TRANSLATIONS.error,
            description: TRANSLATIONS.invalidCustomContentName
          })
          return prev
        }
        
        // בדיקה אם השם החדש כבר קיים
        if (newContents.some((content, i) => i !== index && content.name === value)) {
          toast({
            variant: "destructive",
            title: TRANSLATIONS.error,
            description: TRANSLATIONS.customContentNameExists
          })
          return prev
        }
      }
      newContents[index][field] = value
      return newContents
    })
  }

  const handleRemoveCustomContent = (index: number) => {
    setCustomContents(prev => {
      const newContents = prev.filter((_, i) => i !== index)
      return newContents
    })
  }

  const handleLogoUpload = async () => {
    if (!logoFile || !templateId) {
      toast({
        variant: "destructive",
        title: TRANSLATIONS.error,
        description: "Please select a logo file"
      })
      return
    }

    try {
      setIsUploading(true)
      const formData = new FormData()
      formData.append('file', logoFile)
      formData.append('templateId', templateId)

      const response = await fetch('/api/logo', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Failed to upload logo')
      }

      const { filePath } = await response.json()
      setLogoPath(filePath)
      toast({
        title: TRANSLATIONS.success,
        description: "Logo uploaded successfully"
      })
    } catch (error) {
      console.error('Error uploading logo:', error)
      toast({
        variant: "destructive",
        title: TRANSLATIONS.error,
        description: "Failed to upload logo"
      })
    } finally {
      setIsUploading(false)
    }
  }

  const handleLogoDelete = async () => {
    if (!logoPath || !templateId) return

    try {
      const response = await fetch(`/api/logo?templateId=${templateId}&filePath=${logoPath}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete logo')
      }

      setLogoPath(null)
      setLogoFile(null)
      toast({
        title: TRANSLATIONS.success,
        description: "Logo deleted successfully"
      })
    } catch (error) {
      console.error('Error deleting logo:', error)
      toast({
        variant: "destructive",
        title: TRANSLATIONS.error,
        description: "Failed to delete logo"
      })
    }
  }

  const getLogoPreviewUrl = () => {
    if (!logoPath) return undefined
    return supabase.storage
      .from('storage')
      .getPublicUrl(logoPath)
      .data.publicUrl
  }

  const handleHeaderChange = (prop: keyof ElementStyle, value: any) => {
    if (prop === 'logoPosition' && typeof value === 'string') {
      const position = value as LogoPosition;
      setElementStyles(prev => ({
        ...prev,
        header: {
          ...prev.header,
          logoPosition: position
        }
      }));
      return;
    }
    
    setElementStyles(prev => ({
      ...prev,
      header: {
        ...prev.header,
        [prop]: value
      }
    }));
  }

  const fetchRecentSubmissions = async () => {
    console.log('Fetching recent submissions');
    setIsLoadingSubmissions(true);
    try {
      // Only fetch if we have a formId
      if (!formId) {
        console.log('No formId available, skipping fetch');
        setRecentSubmissions([]);
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/jotform-results?formId=${formId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch submissions');
      }
      const data = await response.json();
      console.log('Fetched submissions:', data);
      const submissions = Array.isArray(data) ? data : data.submissions || [];
      setRecentSubmissions(submissions);
    } catch (error) {
      console.error('Error fetching recent submissions:', error);
      setRecentSubmissions([]);
    } finally {
      setIsLoadingSubmissions(false);
    }
  };

  // Fetch on mount and every minute, but only if formId changes
  useEffect(() => {
    if (formId) {
      fetchRecentSubmissions();
      const interval = setInterval(fetchRecentSubmissions, 60000);
      return () => clearInterval(interval);
    }
  }, [formId]);

  const handleDetailsClick = (submission: SubmissionStatus) => {
    setSelectedSubmission(submission);
  };

  const formatLogEntry = (log: any) => {
    if (!log) return null;
    return (
      <div className="border-b pb-2 mb-2 last:border-0">
        <div className="text-sm font-medium">{log.stage}</div>
        <div className="text-sm text-gray-600">{log.message}</div>
        <div className="text-xs text-gray-400">{new Date(log.timestamp).toLocaleString()}</div>
        {log.details && (
          <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto">
            {JSON.stringify(log.details, null, 2)}
          </pre>
        )}
      </div>
    );
  };

  const handleMediaUpload = async () => {
    if (!mediaFiles || !templateId) {
      toast({
        variant: "destructive",
        title: "שגיאה",
        description: "נא לבחור קבצים להעלאה"
      });
      return;
    }

    setIsMediaUploading(true);
    const newUrls: string[] = [];

    try {
      for (let i = 0; i < mediaFiles.length; i++) {
        const file = mediaFiles[i];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('templateId', templateId);

        const response = await fetch('/api/media', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        const { publicUrl } = await response.json();
        if (!publicUrl) {
          throw new Error('Missing public URL from response');
        }

        newUrls.push(publicUrl);
      }

      setUploadedMediaUrls(prev => [...newUrls, ...prev]);
      setShowMediaInstructions(true);
      setIsMediaModalOpen(false);
      
      toast({
        title: "הצלחה",
        description: `${newUrls.length} קבצים הועלו בהצלחה`
      });
    } catch (error) {
      console.error('Error uploading media:', error);
      toast({
        variant: "destructive",
        title: "שגיאה",
        description: "שגיאה בהעלאת הקבצים"
      });
    } finally {
      setIsMediaUploading(false);
      setMediaFiles(null);
    }
  };

  const handleMediaDelete = async (url: string) => {
    const filePath = url.split('/storage/')[1];
    await fetch(`/api/media?templateId=${templateId}&filePath=${filePath}`, {
      method: 'DELETE',
    });
    setUploadedMediaUrls(prev => prev.filter(u => u !== url));
  };

  marked.setOptions({
    breaks: true,
    gfm: true
  });

  const handleColorChange = (color: string, index: number) => {
    const colorKey = `color${index + 1}` as keyof Template;
    setTemplate(prev => {
      if (!prev) return prev;

      const updatedStyles = { ...prev.elementStyles };
      
      if (index === 0) {
        updatedStyles.main = {
          ...updatedStyles.main,
          backgroundColor: color
        };
      } else if (index === 1) {
        updatedStyles.prose = {
          ...updatedStyles.prose,
          backgroundColor: color
        };
      }

      return {
        ...prev,
        [colorKey]: color,
        elementStyles: updatedStyles
      };
    });
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="space-y-6">
        <div>
          <label className="text-sm font-medium">{TRANSLATIONS.templateName}</label>
          <Input
            placeholder="Template Name"
            value={templateName}
            onChange={(e) => {
              setTemplateName(e.target.value);
              const validation = validateTemplateName(e.target.value);
              if (!validation.isValid) {
                toast({
                  variant: "destructive",
                  title: TRANSLATIONS.error,
                  description: validation.error
                });
              }
            }}
          />
        </div>

        <div className="flex flex-col items-start gap-2">
          <label className="text-sm font-medium">לוגו</label>
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 border rounded-lg flex items-center justify-center bg-muted overflow-hidden">
              {logoPath ? (
                <img 
                  src={getLogoPreviewUrl()} 
                  alt="Logo" 
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <ImageIcon className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => setIsLogoModalOpen(true)} className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                העלאת לוגו
              </Button>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="showLogo"
                    checked={elementStyles.header.showLogo ?? true}
                    onChange={(e) => handleHeaderChange('showLogo', e.target.checked)}
                  />
                  <label htmlFor="showLogo">הצג לוגו</label>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="logoHeight">גובה לוגו</label>
                  <input
                    type="number"
                    id="logoHeight"
                    className="border rounded p-2"
                    value={elementStyles.header?.logoHeight?.replace('px', '') || '100'}
                    onChange={(e) => handleHeaderChange('logoHeight', `${e.target.value}px`)}
                    min="20"
                    max="500"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label>מיקום לוגו</label>
                  <select
                    value={elementStyles.header?.logoPosition || 'top-right'}
                    onChange={(e) => handleHeaderChange('logoPosition', e.target.value)}
                    className="border rounded p-2"
                  >
                    <option value="top-right">ימין למעלה</option>
                    <option value="top-center">מרכז למעלה</option>
                    <option value="top-left">שמאל למעלה</option>
                    <option value="bottom-right">ימין למטה</option>
                    <option value="bottom-center">מרכז למטה</option>
                    <option value="bottom-left">שמאל למטה</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <Button variant="outline" onClick={() => setIsUploadDialogOpen(true)}>
            <Upload className="h-4 w-4 ml-2" />
            {TRANSLATIONS.uploadFont}
          </Button>
        </div>

        <div>
          <Button variant="outline" onClick={() => setIsMediaModalOpen(true)}>
            <Upload className="h-4 w-4 ml-2" />
            העלאת מדיה
          </Button>
        </div>

        {/* Logo Upload Modal */}
        <Dialog open={isLogoModalOpen} onOpenChange={setIsLogoModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>העלאת לוגו</DialogTitle>
              <DialogDescription>בחר קובץ תמונה להעלאה</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>קובץ לוגו</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="flex justify-end gap-2">
                {logoPath && (
                  <Button
                    variant="destructive"
                    onClick={handleLogoDelete}
                    type="button"
                  >
                    מחיקת לוגו
                  </Button>
                )}
                <Button 
                  onClick={async () => {
                    await handleLogoUpload()
                    setIsLogoModalOpen(false)
                  }}
                  disabled={!logoFile || isUploading}
                >
                  {isUploading ? 'מעלה...' : 'העלאה'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Font Upload Modal */}
        <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{TRANSLATIONS.uploadFont}</DialogTitle>
              <DialogDescription>{TRANSLATIONS.uploadFontDescription}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>{TRANSLATIONS.fontName}</Label>
                <Input
                  value={fontName}
                  onChange={(e) => setFontName(e.target.value)}
                  placeholder={TRANSLATIONS.enterFontName}
                />
              </div>
              <div>
                <Label>{TRANSLATIONS.uploadFontDescription}</Label>
                <Input
                  type="file"
                  accept=".woff2,.woff,.ttf,.otf"
                  onChange={(e) => setFontFile(e.target.files?.[0] || null)}
                />
              </div>
              <Button 
                onClick={handleFontUpload} 
                disabled={!fontName?.trim() || !fontFile || isUploading}
                className="w-full"
              >
                {isUploading ? 'מעלה...' : TRANSLATIONS.uploadFont}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div>
          <label className="text-sm font-medium">{TRANSLATIONS.templateGsheetsId}</label>
          <Input
            placeholder="Template Google Sheets ID"
            value={templateGsheetsId}
            onChange={(e) => {
              const newValue = e.target.value;
              // Allow only valid characters
              if (newValue && !/^[a-zA-Z0-9_-]*$/.test(newValue)) {
                return;
              }
              setTemplateGsheetsId(newValue);
              const validation = validateGSheetsId(newValue);
              if (!validation.isValid) {
                toast({
                  variant: "destructive",
                  title: TRANSLATIONS.error,
                  description: validation.error
                });
              }
            }}
            className="mt-2 font-mono" // Use monospace font for better ID readability
          />
        </div>

        <div>
          <label className="text-sm font-medium">Form ID</label>
          <Input
            placeholder="Form ID (JotForm/Elementor)"
            value={formId}
            onChange={(e) => {
              const newValue = e.target.value;
              // Allow alphanumeric characters for both JotForm and Elementor IDs
              if (newValue && !/^[a-zA-Z0-9]*$/.test(newValue)) {
                return;
              }
              setFormId(newValue);
              const validation = validateFormId(newValue);
              if (!validation.isValid) {
                toast({
                  variant: "destructive",
                  title: TRANSLATIONS.error,
                  description: validation.error
                });
              }
            }}
            className="mt-2 font-mono" // Use monospace font for better ID readability
          />
        </div>

        {/* General settings area */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="sendEmail"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="sendEmail" className="text-sm font-medium">
              שלח מייל לאחר שליחת הטופס
            </label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="send-whatsapp"
              checked={sendWhatsapp}
              onChange={(e) => setSendWhatsapp(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="send-whatsapp" className="text-sm font-medium">
              שלח הודעת WhatsApp לאחר שליחת הטופס
            </label>
          </div>

          <div>
            <label className="text-sm font-medium">Webhook URL</label>
            <Input
              placeholder="https://your-webhook-url.com"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="mt-2 font-mono"
              dir="ltr"
            />
          </div>

          <div>
            <label className="text-sm font-medium">וובהוק עיבוד מקדים</label>
            <Input
              placeholder="https://your-preprocessing-webhook.com"
              value={template?.preprocessing_webhook_url || ""}
              onChange={(e) => {
                const url = e.target.value.trim();
                if (url && !/^https?:\/\/.+/.test(url)) {
                  toast({
                    variant: "destructive",
                    title: "שגיאה",
                    description: "כתובת URL לא תקינה. חייבת להתחיל ב-http:// או https://"
                  });
                }
                setTemplate(prev => prev ? { ...prev, preprocessing_webhook_url: e.target.value } : null);
              }}
              className="mt-2 font-mono"
              dir="ltr"
            />
            <p className="text-sm text-muted-foreground mt-1">
              וובהוק זה יקבל את תוכן הטופס אחרי תמלול ויאפשר לבצע עיבוד מקדים לפני העברה לקלוד
            </p>
          </div>

          <div className="my-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="use_optimized_prompting"
                checked={template?.use_optimized_prompting || false}
                onChange={(e) => 
                  setTemplate(prev => prev ? { ...prev, use_optimized_prompting: e.target.checked } : null)
                }
                className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
              />
              <label htmlFor="use_optimized_prompting" className="mr-2 text-sm font-medium">
                השתמש בשיטת פרומפטים מאוחדת (חסכונית)
              </label>
            </div>
            <p className="text-sm text-muted-foreground mt-1 mr-6">
              כאשר מופעל, רק בפרומפט האחרון יישלחו כל התשובות הקודמות. בכל פרומפט אחר, יישלח רק התוכן הנוכחי ללא היסטוריה.
              שיטה זו חוסכת בטוקנים אך עלולה להשפיע על איכות התשובות.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <ColorPicker
            id="mainBackground"
            label="צבע רקע ראשי"
            value={styles?.mainBackground}
            onChange={(value) => setStyles(prev => ({ ...prev, mainBackground: value }))}
          />
          <ColorPicker
            id="contentBackground"
            label="צבע רקע תוכן"
            value={styles?.contentBackground}
            onChange={(value) => setStyles(prev => ({ ...prev, contentBackground: value }))}
          />
        </div>
      </div>

      <Tabs defaultValue="content" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="content">{TRANSLATIONS.content}</TabsTrigger>
          <TabsTrigger value="microCopy">{TRANSLATIONS.microCopy}</TabsTrigger>
          <TabsTrigger value="styles">{TRANSLATIONS.styles}</TabsTrigger>
          <TabsTrigger value="email">תבנית מייל</TabsTrigger>
          <TabsTrigger value="status">סטטוס שליחות</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
        </TabsList>

        <TabsContent value="content">
          <div className="space-y-4">
            <Textarea
              placeholder={TRANSLATIONS.enterMarkdownContent}
              value={mdContent}
              onChange={(e) => setMdContent(e.target.value)}
              className="min-h-[300px]"
              dir="ltr"
              style={{ textAlign: 'left' }}
            />
            <Dialog>
              <DialogTrigger asChild>
                <Button onClick={handlePreview} className="w-full">{TRANSLATIONS.preview}</Button>
              </DialogTrigger>
              <DialogContent className="max-w-[90vw] max-h-[90vh]">
                <DialogHeader>
                  <DialogTitle>{TRANSLATIONS.preview}</DialogTitle>
                  <DialogDescription>{TRANSLATIONS.previewDescription}</DialogDescription>
                </DialogHeader>
                <div className="mt-4 overflow-auto max-h-[70vh]">
                  <iframe
                    srcDoc={previewHtml}
                    className="w-full h-[60vh] border rounded"
                    title={TRANSLATIONS.preview}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>

        <TabsContent value="microCopy">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{TRANSLATIONS.openingPage}</label>
              <Textarea
                placeholder={TRANSLATIONS.openingPage}
                value={openingPageContent}
                onChange={(e) => setOpeningPageContent(e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{TRANSLATIONS.closingPage}</label>
              <Textarea
                placeholder={TRANSLATIONS.closingPage}
                value={closingPageContent}
                onChange={(e) => setClosingPageContent(e.target.value)}
                className="mt-2"
              />
            </div>
            <Button variant="outline" onClick={handleAddCustomContent} className="w-full">
              {TRANSLATIONS.addCustomContent}
            </Button>
            {customContents.map((content, index) => (
              <div key={index} className="space-y-2">
                <div className="flex justify-between items-center">
                  <Input
                    value={content.name}
                    onChange={(e) => handleCustomContentChange(index, 'name', e.target.value)}
                    placeholder={TRANSLATIONS.customContentName}
                    className="w-48"
                  />
                  <Button variant="ghost" size="sm" onClick={() => handleRemoveCustomContent(index)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea
                  value={content.content}
                  onChange={(e) => handleCustomContentChange(index, 'content', e.target.value)}
                  className="mt-2"
                />
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="styles">
          <div className="flex h-full">
            {/* Sidebar */}
            <div className="w-1/4 bg-muted border-l overflow-y-auto">
              <div className="p-2">
                <Button 
                  variant="outline" 
                  className="w-full mb-4"
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/templates/refresh-css', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ templateId })
                      });

                      if (!response.ok) {
                        throw new Error('Failed to refresh CSS');
                      }

                      toast({
                        title: "הצלחה",
                        description: "ה-CSS עודכן בהצלחה"
                      });
                    } catch (error) {
                      console.error('Error refreshing CSS:', error);
                      toast({
                        variant: "destructive",
                        title: "שגיאה",
                        description: "שגיאה בעדכון ה-CSS"
                      });
                    }
                  }}
                >
                  רענן CSS
                </Button>

                {/* General & Layout */}
                <div className="space-y-1">
                  <button
                    onClick={() => setActiveElement("body")}
                    className={`w-full text-right px-4 py-2 text-sm rounded-md transition-colors ${
                      activeElement === "body" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                    }`}
                  >
                    {TRANSLATIONS.generalStyles}
                  </button>
                  <button
                    onClick={() => setActiveElement("header")}
                    className={`w-full text-right px-4 py-2 text-sm rounded-md transition-colors ${
                      activeElement === "header" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                    }`}
                  >
                    {TRANSLATIONS.header} (כולל הגדרות לוגו)
                  </button>
                  <button
                    onClick={() => setActiveElement("footer")}
                    className={`w-full text-right px-4 py-2 text-sm rounded-md transition-colors ${
                      activeElement === "footer" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                    }`}
                  >
                    {TRANSLATIONS.footer}
                  </button>
                  <button
                    onClick={() => setActiveElement("specialParagraph")}
                    className={`w-full text-right px-4 py-2 text-sm rounded-md transition-colors ${
                      activeElement === "specialParagraph" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                    }`}
                  >
                    {TRANSLATIONS.special}
                  </button>
                </div>

                <div className="my-3 border-t border-border/40" />

                {/* Headers */}
                <div className="space-y-1">
                  {["h1", "h2", "h3", "h4", "h5", "h6"].map((header) => (
                    <button
                      key={header}
                      onClick={() => setActiveElement(header as ElementType)}
                      className={`w-full text-right px-4 py-2 text-sm rounded-md transition-colors ${
                        activeElement === header ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                      }`}
                    >
                      {header.toUpperCase()}
                    </button>
                  ))}
                </div>

                <div className="my-3 border-t border-border/40" />

                {/* Content */}
                <div className="space-y-1">
                  <button
                    onClick={() => setActiveElement("p")}
                    className={`w-full text-right px-4 py-2 text-sm rounded-md transition-colors ${
                      activeElement === "p" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                    }`}
                  >
                    {TRANSLATIONS.paragraph}
                  </button>
                  <button
                    onClick={() => setActiveElement("list")}
                    className={`w-full text-right px-4 py-2 text-sm rounded-md transition-colors ${
                      activeElement === "list" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                    }`}
                  >
                    {TRANSLATIONS.list}
                  </button>
                </div>
              </div>
            </div>

            {/* Style Editor */}
            <div className="flex-1 overflow-y-auto">
              <StyleEditor 
                style={elementStyles[activeElement]} 
                onChange={handleStyleChange}
                customFonts={customFonts}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="email" className="flex-1">
          <div className="space-y-4 p-4">
            <div className="bg-muted p-4 rounded-lg mb-4 text-right space-y-4">
              <div>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">נושא המייל</label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="w-full p-2 border rounded-md"
                      dir="rtl"
                      placeholder="נושא המייל שיישלח"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label>כתובת למענה (Reply-To)</Label>
                <Input
                  value={emailFrom}
                  onChange={(e) => {
                    setEmailFrom(e.target.value);
                    const validation = validateEmailAddress(e.target.value);
                    if (!validation.isValid) {
                      toast({
                        variant: "destructive",
                        title: TRANSLATIONS.error,
                        description: validation.error
                      });
                    }
                  }}
                  placeholder="השאר ריק כדי להשתמש בכתובת ברירת המחדל"
                  dir="ltr"
                />
              </div>
              
              <div>
                <Label>תוכן המייל</Label>
                <EmailEditor
                  value={emailBody}
                  onChange={setEmailBody}
                />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="status" className="flex-1">
          <div className="space-y-4 p-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold">שליחות מהיממה האחרונה</h3>
              <Button variant="outline" onClick={fetchRecentSubmissions} size="sm">
                רענן
              </Button>
            </div>
            
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-right">זמן</th>
                    <th className="p-2 text-right">סטטוס עיבוד</th>
                    <th className="p-2 text-right">סטטוס מייל</th>
                    <th className="p-2 text-right">פרטים</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSubmissions.slice(0, 10).map((sub) => (
                    <tr key={sub.submission_id} className="border-t">
                      <td className="p-2">
                        {format(new Date(sub.created_at), 'HH:mm:ss')}
                      </td>
                      <td className="p-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                          sub.status === 'completed' ? 'bg-green-100 text-green-800' :
                          sub.status === 'error' ? 'bg-red-100 text-red-800' :
                          sub.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {sub.status === 'completed' ? 'הושלם' :
                           sub.status === 'error' ? 'שגיאה' :
                           sub.status === 'processing' ? 'מעבד' :
                           'ממתין'}
                        </span>
                      </td>
                      <td className="p-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                          sub.email_status === 'sent' ? 'bg-green-100 text-green-800' :
                          sub.email_status === 'error' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {sub.email_status === 'sent' ? 'נשלח' :
                           sub.email_status === 'error' ? 'שגיאה' :
                           'ממתין'}
                        </span>
                      </td>
                      <td className="p-2">
                        <div className="flex gap-2 items-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDetailsClick(sub)}
                          >
                            פרטים
                          </Button>
                          {sub.status === 'completed' && (
                            <a
                              href={`https://md-html-template.vercel.app/results?s=${sub.submission_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-700"
                            >
                              @
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {recentSubmissions.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-gray-500">
                        {isLoadingSubmissions ? (
                          'טוען שליחות...'
                        ) : (
                          'אין שליחות מהיממה האחרונה'
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-0">
          <div className="space-y-4 p-4">
            {sendWhatsapp && (
              <div className="space-y-4">
                <div>
                  <Label>תוכן ההודעה</Label>
                  <Textarea
                    value={whatsappMessage}
                    onChange={(e) => setWhatsappMessage(e.target.value)}
                    placeholder="היי, האבחון האישי שלך מוכן! אפשר לצפות בו כאן: https://md-html-template.vercel.app/results?s={{id}}"
                    rows={5}
                    dir="rtl"
                  />
                  <p className="text-sm text-muted-foreground mt-2">
                    משתנים זמינים: {'{{id}}'} - מזהה השליחה
                  </p>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
      <Button onClick={handleSave} className="w-full mt-4">{TRANSLATIONS.saveTemplate}</Button>

      <Dialog open={!!selectedSubmission} onOpenChange={(open) => !open && setSelectedSubmission(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>פרטי שליחה מלאים</DialogTitle>
          </DialogHeader>
          {selectedSubmission && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">מזהה שליחה</label>
                  <div className="text-sm font-mono">{selectedSubmission.submission_id}</div>
                </div>
                <div>
                  <label className="text-sm font-medium">זמן יצירה</label>
                  <div className="text-sm">{new Date(selectedSubmission.created_at).toLocaleString()}</div>
                </div>
                {selectedSubmission.content?.parsedRequest && (
                  <>
                    {Object.entries(selectedSubmission.content.parsedRequest)
                      .filter(([key, value]) => value && typeof value === 'string' && value.trim() !== '')
                      .map(([key, value]) => (
                        <div key={key}>
                          <label className="text-sm font-medium">
                            {selectedSubmission.content?.pretty 
                              ? selectedSubmission.content.pretty.split(',')
                                  .find(pair => {
                                    const [label, val] = pair.split(':').map(s => s.trim());
                                    return val === value;
                                  })?.split(':')[0]?.trim() || key
                              : key}
                          </label>
                          <div className="text-sm">{value}</div>
                        </div>
                    ))}
                  </>
                )}
                <div>
                  <label className="text-sm font-medium">סטטוס עיבוד</label>
                  <div className="text-sm">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                      selectedSubmission.status === 'completed' ? 'bg-green-100 text-green-800' :
                      selectedSubmission.status === 'error' ? 'bg-red-100 text-red-800' :
                      selectedSubmission.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedSubmission.status === 'completed' ? 'הושלם' :
                       selectedSubmission.status === 'error' ? 'שגיאה' :
                       selectedSubmission.status === 'processing' ? 'מעבד' :
                       'ממתין'}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">סטטוס מייל</label>
                  <div className="text-sm">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                      selectedSubmission.email_status === 'sent' ? 'bg-green-100 text-green-800' :
                      selectedSubmission.email_status === 'error' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedSubmission.email_status === 'sent' ? 'נשלח' :
                       selectedSubmission.email_status === 'error' ? 'שגיאה' :
                       'ממתין'}
                    </span>
                  </div>
                </div>
                {selectedSubmission.whatsapp_status && (
                  <div>
                    <label className="text-sm font-medium">סטטוס WhatsApp</label>
                    <div className="text-sm">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                        selectedSubmission.whatsapp_status === 'sent' ? 'bg-green-100 text-green-800' :
                        selectedSubmission.whatsapp_status === 'error' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {selectedSubmission.whatsapp_status === 'sent' ? 'נשלח' :
                         selectedSubmission.whatsapp_status === 'error' ? 'שגיאה' :
                         'ממתין'}
                      </span>
                    </div>
                  </div>
                )}
                {selectedSubmission.has_audio && (
                  <div>
                    <label className="text-sm font-medium">סטטוס תמלול</label>
                    <div className="text-sm">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                        selectedSubmission.transcription_status === 'completed' ? 'bg-green-100 text-green-800' :
                        selectedSubmission.transcription_status === 'error' ? 'bg-red-100 text-red-800' :
                        selectedSubmission.transcription_status === 'processing' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {selectedSubmission.transcription_status === 'completed' ? 'הושלם' :
                         selectedSubmission.transcription_status === 'error' ? 'שגיאה' :
                         selectedSubmission.transcription_status === 'processing' ? 'מתמלל' :
                         'ממתין'}
                      </span>
                    </div>
                  </div>
                )}
                {selectedSubmission.email_sent_at && (
                  <div>
                    <label className="text-sm font-medium">זמן שליחת מייל</label>
                    <div className="text-sm">{new Date(selectedSubmission.email_sent_at).toLocaleString()}</div>
                  </div>
                )}
                {selectedSubmission.whatsapp_sent_at && (
                  <div>
                    <label className="text-sm font-medium">זמן שליחת WhatsApp</label>
                    <div className="text-sm">{new Date(selectedSubmission.whatsapp_sent_at).toLocaleString()}</div>
                  </div>
                )}
                {selectedSubmission.recipient_email && (
                  <div>
                    <label className="text-sm font-medium">נמען מייל</label>
                    <div className="text-sm">{selectedSubmission.recipient_email}</div>
                  </div>
                )}
                {selectedSubmission.recipient_phone && (
                  <div>
                    <label className="text-sm font-medium">נמען WhatsApp</label>
                    <div className="text-sm">{selectedSubmission.recipient_phone}</div>
                  </div>
                )}
                {selectedSubmission.updated_at && (
                  <div>
                    <label className="text-sm font-medium">עדכון אחרון</label>
                    <div className="text-sm">{new Date(selectedSubmission.updated_at).toLocaleString()}</div>
                  </div>
                )}
              </div>

              {selectedSubmission.progress && (
                <div>
                  <label className="text-sm font-medium">התקדמות</label>
                  <div className="mt-2 bg-muted p-3 rounded-lg">
                    <div className="text-sm font-medium">{selectedSubmission.progress.stage}</div>
                    <div className="text-sm text-muted-foreground">{selectedSubmission.progress.message}</div>
                    {selectedSubmission.progress.timestamp && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(selectedSubmission.progress.timestamp).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedSubmission.content?.email_subject && (
                <div>
                  <label className="text-sm font-medium">נושא המייל שנשלח</label>
                  <div className="mt-2 bg-muted p-3 rounded-lg">
                    <div className="text-sm">{selectedSubmission.content.email_subject}</div>
                  </div>
                </div>
              )}

              {selectedSubmission.content?.email_body && (
                <div>
                  <label className="text-sm font-medium">תוכן המייל שנשלח</label>
                  <div className="mt-2 bg-muted p-3 rounded-lg max-h-32 overflow-y-auto">
                    <div className="text-sm whitespace-pre-wrap">{selectedSubmission.content.email_body}</div>
                  </div>
                </div>
              )}

              {selectedSubmission.content?.whatsapp_message && (
                <div>
                  <label className="text-sm font-medium">הודעת WhatsApp שנשלחה</label>
                  <div className="mt-2 bg-muted p-3 rounded-lg">
                    <div className="text-sm whitespace-pre-wrap">{selectedSubmission.content.whatsapp_message}</div>
                  </div>
                </div>
              )}

              {selectedSubmission.logs && selectedSubmission.logs.length > 0 && (
                <div>
                  <label className="text-sm font-medium">לוג מלא</label>
                  <div className="mt-2 space-y-2">
                    {selectedSubmission.logs.map((log, index) => (
                      <div key={index} className="bg-muted p-3 rounded-lg">
                        <div className="text-sm font-medium">{log.stage}</div>
                        <div className="text-sm text-muted-foreground">{log.message}</div>
                        {log.timestamp && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {new Date(log.timestamp).toLocaleString()}
                          </div>
                        )}
                        {log.details && (
                          <pre className="mt-2 text-xs bg-background p-2 rounded overflow-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedSubmission.result && (
                <div>
                  <label className="text-sm font-medium">תוצאה</label>
                  <div className="mt-2 bg-muted p-3 rounded-lg">
                    <pre className="text-sm overflow-auto whitespace-pre-wrap">
                      {typeof selectedSubmission.result === 'string' 
                        ? selectedSubmission.result 
                        : JSON.stringify(selectedSubmission.result, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {selectedSubmission.email_error && (
                <div>
                  <label className="text-sm font-medium text-red-600">שגיאת מייל</label>
                  <div className="mt-2 bg-red-50 text-red-700 p-3 rounded-lg">
                    <div className="text-sm">{selectedSubmission.email_error}</div>
                  </div>
                </div>
              )}

              {selectedSubmission.whatsapp_error && (
                <div>
                  <label className="text-sm font-medium text-red-600">שגיאת WhatsApp</label>
                  <div className="mt-2 bg-red-50 text-red-700 p-3 rounded-lg">
                    <div className="text-sm">{selectedSubmission.whatsapp_error}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isMediaModalOpen} onOpenChange={setIsMediaModalOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>העלאת מדיה</DialogTitle>
            <DialogDescription>בחר תמונות להעלאה</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            <div className="flex justify-between items-center">
              <Label>קבצי מדיה</Label>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowMediaInstructions(true)}
              >
                <HelpCircle className="w-4 h-4 ml-2" />
                הדרכה על שליטה בגודל תמונות
              </Button>
            </div>
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setMediaFiles(e.target.files)}
            />
            <div className="flex justify-end">
              <Button 
                onClick={handleMediaUpload}
                disabled={!mediaFiles || isMediaUploading}
              >
                {isMediaUploading ? 'מעלה...' : 'העלאה'}
              </Button>
            </div>

            {/* Gallery Grid */}
            <div className="overflow-y-auto">
              <h3 className="text-sm font-medium mb-3">תמונות קיימות בתבנית</h3>
              <div className="grid grid-cols-2 gap-4">
                {uploadedMediaUrls.map((url, index) => (
                  <div key={index} className="relative group">
                    <div className="aspect-square overflow-hidden rounded-lg border bg-muted">
                      <img 
                        src={url} 
                        alt={`תמונה ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          navigator.clipboard.writeText(`![](${url})`);
                          toast({
                            title: "הצלחה",
                            description: "קוד Markdown הועתק ללוח",
                          });
                        }}
                      >
                        העתק Markdown
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (confirm('האם אתה בטוח שברצונך למחוק תמונה זו?')) {
                            handleMediaDelete(url);
                          }
                        }}
                      >
                        מחק
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showMediaInstructions} onOpenChange={setShowMediaInstructions}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>שליטה בגודל ומראה התמונות</DialogTitle>
            <DialogDescription>ניתן לשלוט בגודל ומראה התמונות באמצעות פרמטרים מיוחדים</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            {/* Basic Examples */}
            <div className="bg-muted p-4 rounded-lg">
              <h3 className="font-bold mb-2">דוגמאות בסיסיות:</h3>
              <div className="space-y-2 font-mono text-sm">
                <p>![](URL) - תמונה רגילה</p>
                <p>![[height=200px]](URL) - גובה קבוע</p>
                <p>![[width=300px]](URL) - רוחב קבוע</p>
                <p>![[width=100%]](URL) - רוחב מלא</p>
              </div>
            </div>

            {/* Advanced Examples */}
            <div className="bg-muted p-4 rounded-lg">
              <h3 className="font-bold mb-2">שימושים מתקדם:</h3>
              <div className="space-y-2">
                <div>
                  <p className="font-bold text-sm">התאמה חכמה לקונטיינר:</p>
                  <code className="text-sm">![[height=300px][object-fit=cover]](URL)</code>
                </div>
                <div>
                  <p className="font-bold text-sm">הגבלת גודל מקסימלי:</p>
                  <code className="text-sm">![[max-width=500px][max-height=400px]](URL)</code>
                </div>
                <div>
                  <p className="font-bold text-sm">עיצוב מתקדם:</p>
                  <code className="text-sm">![[border-radius=8px][opacity=0.9]](URL)</code>
                </div>
              </div>
            </div>

            {/* All Available Parameters */}
            <div>
              <h3 className="font-bold mb-2">כל הפרמטרים הזמינים:</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="font-bold text-sm">מידות:</p>
                  <ul className="text-sm list-disc list-inside">
                    <li>width</li>
                    <li>height</li>
                    <li>max-width</li>
                    <li>max-height</li>
                    <li>min-width</li>
                    <li>min-height</li>
                  </ul>
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-sm">עיצוב:</p>
                  <ul className="text-sm list-disc list-inside">
                    <li>object-fit</li>
                    <li>object-position</li>
                    <li>opacity</li>
                    <li>border-radius</li>
                    <li>margin</li>
                    <li>display</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Tips */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-bold mb-2">טיפים:</h3>
              <ul className="text-sm list-disc list-inside space-y-1">
                <li>ניתן לשלב כמה פרמטרים יחד</li>
                <li>סדר הפרמטרים לא משנה</li>
                <li>ניתן להשתמש ביחידות שונות (px, %, rem, וכו׳)</li>
                <li>אפשר להשתמש בפרמטרים גם בלי טקסט אלטרנטיבי</li>
              </ul>
            </div>

            {/* Common Use Cases */}
            <div className="bg-muted p-4 rounded-lg">
              <h3 className="font-bold mb-2">דוגמאות שימושיות:</h3>
              <div className="space-y-2">
                <div>
                  <p className="font-bold text-sm">תמונת רקע מלאה:</p>
                  <code className="text-sm">![[width=100%][height=300px][object-fit=cover]](URL)</code>
                </div>
                <div>
                  <p className="font-bold text-sm">תמונה עגולה (אווטאר):</p>
                  <code className="text-sm">![[width=100px][height=100px][border-radius=50%][object-fit=cover]](URL)</code>
                </div>
                <div>
                  <p className="font-bold text-sm">תמונה רספונסיבית:</p>
                  <code className="text-sm">![[width=100%][max-width=800px][height=auto]](URL)</code>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
} 