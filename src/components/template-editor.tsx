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
  convertMarkdownToHtml
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
import { Upload } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Trash2 } from "lucide-react"
import { ImageIcon } from "lucide-react"

interface ElementStyle {
  color?: string
  backgroundColor?: string
  fontSize?: string
  margin?: string
  padding?: string
  fontFamily?: string
  textAlign?: 'right' | 'left' | 'center' | 'justify'
  customCss?: string
}

type ElementType = "body" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "list" | "p" | "specialParagraph" | "header" | "footer"

interface Template {
  id: string
  name: string
  color1?: string
  color2?: string
  color3?: string
  color4?: string
  css: string
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
  const [fontName, setFontName] = useState("")
  const [fontFile, setFontFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [customFonts, setCustomFonts] = useState<Template['custom_fonts']>([])
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [colors, setColors] = useState({
    color1: "#000000",
    color2: "#ffffff",
    color3: "#cccccc",
    color4: "#666666"
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
    header: {},
    footer: {}
  })
  const [sidebarWidth, setSidebarWidth] = useState(200)
  const [openingPageContent, setOpeningPageContent] = useState("")
  const [closingPageContent, setClosingPageContent] = useState("")
  const [customContents, setCustomContents] = useState<{ name: string; content: string }[]>([])
  const [logoPath, setLogoPath] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false)

  useEffect(() => {
    if (templateId) {
      loadTemplate(templateId)
    }
  }, [templateId])

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
      footer: {}
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

      // Update only the custom_fonts field in the template
      const updateResponse = await fetch('/api/templates', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: templateId,
          custom_fonts: fonts
        }),
      })

      if (!updateResponse.ok) {
        throw new Error('Failed to update template')
      }

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
    const { data: template, error } = await supabase
      .from('templates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error loading template:', error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load template"
      })
      return
    }

    if (template) {
      setTemplateName(template.name)
      setTemplateGsheetsId(template.template_gsheets_id || "")
      setHeaderContent(template.header_content || "")
      setFooterContent(template.footer_content || "")
      setCustomFonts(template.custom_fonts || [])
      setColors({
        color1: template.color1 || "#000000",
        color2: template.color2 || "#ffffff",
        color3: template.color3 || "#cccccc",
        color4: template.color4 || "#666666"
      })
      
      // Load logo
      const { data: logoData } = await supabase
        .from('logos')
        .select('file_path')
        .eq('template_id', id)
        .single()

      if (logoData) {
        setLogoPath(logoData.file_path)
      }
      
      // Load template contents
      const { data: contentsData, error: contentsError } = await supabase
        .from('template_contents')
        .select('content_name, md_content')
        .eq('template_id', id)

      if (!contentsError && contentsData) {
        contentsData.forEach(content => {
          if (content.content_name === 'opening_page') {
            setOpeningPageContent(content.md_content)
          } else if (content.content_name === 'closing_page') {
            setClosingPageContent(content.md_content)
          } else if (content.content_name.startsWith('custom_')) {
            const customContent = {
              name: content.content_name.replace('custom_', ''),
              content: content.md_content
            }
            setCustomContents(prev => [...prev, customContent])
          }
        })
      }
      
      // Load custom fonts via API
      const response = await fetch(`/api/fonts?templateId=${id}`)
      if (response.ok) {
        const { fonts } = await response.json()
        setCustomFonts(fonts || [])
      }
      
      // Parse CSS to extract element styles
      const extractedStyles = parseCSS(template.css)
      setElementStyles(extractedStyles)
    }
  }

  const handleStyleChange = (style: ElementStyle) => {
    setElementStyles(prev => ({
      ...prev,
      [activeElement]: style
    }))
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
        if (property === 'customCss') return // Skip customCss here
        // Convert camelCase to kebab-case for CSS properties
        const kebabProperty = toKebabCase(property)
        css += `  ${kebabProperty}: ${value};\n`
      })
      
      css += '}\n\n'
    })

    return css
  }

  const handleSave = async () => {
    // Validate required fields
    const validationErrors: string[] = []
    if (!templateName?.trim()) {
      validationErrors.push(TRANSLATIONS.templateNameRequired)
    }
    if (!templateGsheetsId?.trim()) {
      validationErrors.push(TRANSLATIONS.templateGsheetsIdRequired)
    }
    if (!headerContent?.trim()) {
      validationErrors.push(TRANSLATIONS.headerContentRequired)
    }
    if (!footerContent?.trim()) {
      validationErrors.push(TRANSLATIONS.footerContentRequired)
    }

    // Validate styles
    const styleErrors = validateStyles(elementStyles)
    validationErrors.push(...styleErrors)

    if (validationErrors.length > 0) {
      toast({
        variant: "destructive",
        title: TRANSLATIONS.validationError,
        description: validationErrors.join('\n')
      })
      return
    }

    const css = generateCSS(elementStyles)
    const template = {
      id: templateId,
      name: templateName,
      template_gsheets_id: templateGsheetsId,
      header_content: headerContent,
      footer_content: footerContent,
      opening_page_content: openingPageContent,
      closing_page_content: closingPageContent,
      custom_contents: customContents,
      custom_fonts: customFonts,
      logo_path: logoPath,
      ...colors,
      css
    }

    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(template),
      })

      if (!response.ok) {
        const error = await response.text()
        if (error.includes('duplicate key value violates unique constraint "template_name_unique"')) {
          toast({
            variant: "destructive",
            title: TRANSLATIONS.error,
            description: TRANSLATIONS.duplicateTemplateName
          })
          return
        }
        throw new Error('Failed to save template')
      }

      // Save logo if changed
      if (logoFile && templateId) {
        const formData = new FormData()
        formData.append('file', logoFile)
        formData.append('templateId', templateId)

        const logoResponse = await fetch('/api/logo', {
          method: 'POST',
          body: formData,
        })

        if (!logoResponse.ok) {
          throw new Error('Failed to upload logo')
        }
      }

      toast({
        title: TRANSLATIONS.success,
        description: TRANSLATIONS.templateSavedSuccessfully
      })
      onSave?.()
    } catch (error) {
      console.error('Error saving template:', error)
      toast({
        variant: "destructive",
        title: TRANSLATIONS.error,
        description: error instanceof Error && error.message === 'Failed to fetch' 
          ? TRANSLATIONS.networkError 
          : TRANSLATIONS.failedToSaveTemplate
      })
    }
  }

  const handlePreview = async () => {
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
      console.log('Sending preview request with:', {
        markdowns: [mdContent || ''],
        template: {
          template_id: templateId,
          css: generateCSS(elementStyles),
          custom_fonts: customFonts
        },
        header_content: headerContent,
        footer_content: footerContent
      })

      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          markdowns: [mdContent || ''],
          template: {
            template_id: templateId,
            css: generateCSS(elementStyles),
            custom_fonts: customFonts
          },
          header_content: headerContent,
          footer_content: footerContent
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate preview')
      }

      const { htmls } = await response.json()
      console.log('Received preview HTML:', htmls[0])
      setPreviewHtml(htmls[0])
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

  return (
    <div className="space-y-6" dir="rtl">
      <div className="space-y-6">
        <div>
          <label className="text-sm font-medium">{TRANSLATIONS.templateName}</label>
          <Input
            placeholder="Template Name"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
          />
        </div>

        <div className="flex flex-col items-start gap-2">
          <label className="text-sm font-medium">לוגו</label>
          <div className="flex items-start gap-4">
            <div 
              className="w-24 h-24 border rounded-lg flex items-center justify-center bg-muted overflow-hidden"
            >
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
            <Button
              variant="outline"
              onClick={() => setIsLogoModalOpen(true)}
            >
              <Upload className="w-4 h-4 ml-2" />
              העלאת לוגו
            </Button>
          </div>
        </div>

        <div>
          <Button variant="outline" onClick={() => setIsUploadDialogOpen(true)}>
            <Upload className="h-4 w-4 ml-2" />
            {TRANSLATIONS.uploadFont}
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
            onChange={(e) => setTemplateGsheetsId(e.target.value)}
            className="mt-2"
          />
        </div>

        <div className="grid grid-cols-4 gap-4">
          {Object.entries(colors).map(([key, value]) => (
            <div key={key}>
              <label className="text-sm font-medium">{key}</label>
              <Input
                type="color"
                value={value}
                onChange={(e) => setColors(prev => ({ ...prev, [key]: e.target.value }))}
                dir="ltr"
              />
            </div>
          ))}
        </div>
      </div>

      <Tabs defaultValue="content" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="content">{TRANSLATIONS.content}</TabsTrigger>
          <TabsTrigger value="microCopy">{TRANSLATIONS.microCopy}</TabsTrigger>
          <TabsTrigger value="styles">{TRANSLATIONS.styles}</TabsTrigger>
        </TabsList>

        <TabsContent value="content">
          <Textarea
            placeholder={TRANSLATIONS.enterMarkdownContent}
            value={mdContent}
            onChange={(e) => setMdContent(e.target.value)}
            className="min-h-[300px]"
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
        </TabsContent>

        <TabsContent value="microCopy">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{TRANSLATIONS.header}</label>
              <Textarea
                placeholder={TRANSLATIONS.header}
                value={headerContent}
                onChange={(e) => setHeaderContent(e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{TRANSLATIONS.footer}</label>
              <Textarea
                placeholder={TRANSLATIONS.footer}
                value={footerContent}
                onChange={(e) => setFooterContent(e.target.value)}
                className="mt-2"
              />
            </div>
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
              <nav className="p-2">
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
                    {TRANSLATIONS.header}
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
              </nav>
            </div>

            {/* Style Editor */}
            <div className="flex-1 overflow-y-auto">
              <StyleEditor 
                style={elementStyles[activeElement]} 
                onChange={handleStyleChange}
                templateColors={colors}
                customFonts={customFonts}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
      <Button onClick={handleSave} className="w-full mt-4">{TRANSLATIONS.saveTemplate}</Button>
    </div>
  )
} 