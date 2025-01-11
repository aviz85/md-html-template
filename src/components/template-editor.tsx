"use client"

import React from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { StyleEditor } from "@/components/style-editor"
import { createClient } from '@supabase/supabase-js'
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: false
    }
  }
)

interface ElementStyle {
  color?: string
  backgroundColor?: string
  fontSize?: string
  margin?: string
  padding?: string
  fontFamily?: string
}

type ElementType = "body" | "h1" | "h2" | "h3" | "list" | "p" | "specialParagraph"

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
    list: {},
    p: {},
    specialParagraph: {}
  })

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
      list: {},
      p: {},
      specialParagraph: {}
    }

    // Split CSS into rules
    const rules = css.split('}')
    
    rules.forEach(rule => {
      // Find selector and properties
      const [selector, ...properties] = rule.split('{')
      if (!selector || !properties.length) return

      const cleanSelector = selector.trim()
      const elementName = cleanSelector === '.special-paragraph' ? 'specialParagraph' : 
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
              styles[elementName as ElementType][camelKey as keyof ElementStyle] = value
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

      // Save the template with the updated fonts
      const css = generateCSS()
      const template = {
        id: templateId,
        name: templateName,
        template_gsheets_id: templateGsheetsId,
        header_content: headerContent,
        footer_content: footerContent,
        custom_fonts: fonts,
        ...colors,
        css
      }

      const saveResponse = await fetch('/api/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(template),
      })

      if (!saveResponse.ok) {
        throw new Error('Failed to save template')
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
      setColors({
        color1: template.color1 || "#000000",
        color2: template.color2 || "#ffffff",
        color3: template.color3 || "#cccccc",
        color4: template.color4 || "#666666"
      })
      
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

  const generateCSS = () => {
    let css = ""
    
    // Add root variables
    css += `:root {\n`
    if (colors.color1) css += `  --color1: ${colors.color1};\n`
    if (colors.color2) css += `  --color2: ${colors.color2};\n`
    if (colors.color3) css += `  --color3: ${colors.color3};\n`
    if (colors.color4) css += `  --color4: ${colors.color4};\n`
    css += `}\n\n`

    // Add body styles first
    const bodyStyles = elementStyles.body
    if (Object.keys(bodyStyles).length > 0) {
      css += `body {\n`
      Object.entries(bodyStyles).forEach(([prop, value]) => {
        if (value !== undefined && value !== '') {
          const kebabProp = CSS_PROPERTIES[prop as keyof typeof CSS_PROPERTIES]
          css += `  ${kebabProp}: ${value};\n`
        }
      })
      css += `}\n\n`
    }

    // Add default footer styles
    css += `.template-footer {
  margin-top: 3rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color3);
  font-size: 0.875rem;
  color: var(--color4);
  opacity: 0.9;
}\n\n`

    // Add other element styles
    Object.entries(elementStyles).forEach(([element, style]) => {
      if (element === 'body') return // Skip body as it's already handled
      const selector = element === 'specialParagraph' ? '.special-paragraph' : element
      // Only create a rule if there are styles
      const styleEntries = Object.entries(style).filter(([_, value]) => value !== undefined && value !== '')
      if (styleEntries.length > 0) {
        css += `${selector} {\n`
        styleEntries.forEach(([prop, value]) => {
          const kebabProp = CSS_PROPERTIES[prop as keyof typeof CSS_PROPERTIES]
          css += `  ${kebabProp}: ${value};\n`
        })
        css += `}\n\n`
      }
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

    const css = generateCSS()
    const template = {
      id: templateId,
      name: templateName,
      template_gsheets_id: templateGsheetsId,
      header_content: headerContent,
      footer_content: footerContent,
      custom_fonts: customFonts,
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
    // Validate markdown content
    if (!mdContent?.trim()) {
      toast({
        variant: "destructive",
        title: TRANSLATIONS.error,
        description: TRANSLATIONS.pleaseEnterContent
      })
      return
    }

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
        markdowns: [mdContent],
        template: {
          id: templateId,
          css: generateCSS(),
          custom_fonts: customFonts
        }
      })

      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          markdowns: [mdContent],
          template: {
            id: templateId,
            css: generateCSS(),
            custom_fonts: customFonts
          }
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

  return (
    <div className="space-y-4" dir="rtl">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex-1">
            <label className="text-sm font-medium">{TRANSLATIONS.templateName}</label>
            <Input
              placeholder="Template Name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
          </div>
          <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="mr-4 mt-6">
                <Upload className="h-4 w-4 ml-2" />
                {TRANSLATIONS.uploadFont}
              </Button>
            </DialogTrigger>
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
        </div>
        <div>
          <label className="text-sm font-medium">{TRANSLATIONS.templateGsheetsId}</label>
          <Input
            placeholder="Template Google Sheets ID"
            value={templateGsheetsId}
            onChange={(e) => setTemplateGsheetsId(e.target.value)}
            className="mt-2"
          />
        </div>
        <div>
          <label className="text-sm font-medium">{TRANSLATIONS.headerContent}</label>
          <Textarea
            placeholder={TRANSLATIONS.enterHeaderContent}
            value={headerContent}
            onChange={(e) => setHeaderContent(e.target.value)}
            className="mt-2"
          />
        </div>
        <div>
          <label className="text-sm font-medium">{TRANSLATIONS.footerContent}</label>
          <Textarea
            placeholder={TRANSLATIONS.enterFooterContent}
            value={footerContent}
            onChange={(e) => setFooterContent(e.target.value)}
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
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="content">{TRANSLATIONS.content}</TabsTrigger>
          <TabsTrigger value="styles">{TRANSLATIONS.styles}</TabsTrigger>
        </TabsList>
        <TabsContent value="content" className="space-y-4">
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
        <TabsContent value="styles">
          <Tabs value={activeElement} onValueChange={(value: string) => setActiveElement(value as ElementType)}>
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="body">{TRANSLATIONS.generalStyles}</TabsTrigger>
              <TabsTrigger value="h1">H1</TabsTrigger>
              <TabsTrigger value="h2">H2</TabsTrigger>
              <TabsTrigger value="h3">H3</TabsTrigger>
              <TabsTrigger value="list">{TRANSLATIONS.list}</TabsTrigger>
              <TabsTrigger value="p">{TRANSLATIONS.paragraph}</TabsTrigger>
              <TabsTrigger value="specialParagraph">{TRANSLATIONS.special}</TabsTrigger>
            </TabsList>
            <StyleEditor 
              style={elementStyles[activeElement]} 
              onChange={handleStyleChange}
              templateColors={colors}
              customFonts={customFonts}
            />
          </Tabs>
          <Button onClick={handleSave} className="w-full mt-4">{TRANSLATIONS.saveTemplate}</Button>
        </TabsContent>
      </Tabs>
    </div>
  )
} 