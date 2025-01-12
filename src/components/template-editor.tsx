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
    let css = ''
    
    // Add styles for each element
    Object.entries(elementStyles).forEach(([element, styles]) => {
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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="content" className="col-span-2">{TRANSLATIONS.content}</TabsTrigger>
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

        <TabsContent value="styles" className="h-[600px]">
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