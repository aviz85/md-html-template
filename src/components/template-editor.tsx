"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { StyleEditor } from "./style-editor"
import { createClient } from '@supabase/supabase-js'
import { useToast } from "@/hooks/use-toast"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface ElementStyle {
  color?: string
  backgroundColor?: string
  fontSize?: string
  margin?: string
  padding?: string
}

type ElementType = "h1" | "h2" | "h3" | "list" | "paragraph" | "specialParagraph"

interface Template {
  id: string
  name: string
  color1?: string
  color2?: string
  color3?: string
  color4?: string
  css: string
  elementStyles: Record<ElementType, ElementStyle>
}

interface TemplateEditorProps {
  templateId?: string
  onSave?: () => void
}

export function TemplateEditor({ templateId, onSave }: TemplateEditorProps) {
  const { toast } = useToast()
  const [mdContent, setMdContent] = useState("")
  const [activeElement, setActiveElement] = useState<ElementType>("h1")
  const [templateName, setTemplateName] = useState("")
  const [colors, setColors] = useState({
    color1: "#000000",
    color2: "#ffffff",
    color3: "#cccccc",
    color4: "#666666"
  })
  const [elementStyles, setElementStyles] = useState<Template["elementStyles"]>({
    h1: {},
    h2: {},
    h3: {},
    list: {},
    paragraph: {},
    specialParagraph: {}
  })

  useEffect(() => {
    if (templateId) {
      loadTemplate(templateId)
    }
  }, [templateId])

  const parseCSS = (css: string) => {
    const styles: Template["elementStyles"] = {
      h1: {},
      h2: {},
      h3: {},
      list: {},
      paragraph: {},
      specialParagraph: {}
    }

    // Split CSS into rules
    const rules = css.split('}')
    
    rules.forEach(rule => {
      // Find selector and properties
      const [selector, ...properties] = rule.split('{')
      if (!selector || !properties.length) return

      const cleanSelector = selector.trim()
      const elementName = cleanSelector === '.special-paragraph' ? 'specialParagraph' : cleanSelector

      if (elementName in styles) {
        // Parse properties
        const props = properties[0].split(';')
        props.forEach(prop => {
          const [key, value] = prop.split(':').map(s => s.trim())
          if (key && value && isValidStyleProperty(key)) {
            styles[elementName as ElementType][key as keyof ElementStyle] = value
          }
        })
      }
    })

    return styles
  }

  const isValidStyleProperty = (prop: string): prop is keyof ElementStyle => {
    return ['color', 'backgroundColor', 'fontSize', 'margin', 'padding'].includes(prop)
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
      setColors({
        color1: template.color1 || "#000000",
        color2: template.color2 || "#ffffff",
        color3: template.color3 || "#cccccc",
        color4: template.color4 || "#666666"
      })
      
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

  const generateCSS = () => {
    let css = ""
    
    // Add root variables
    css += `:root {\n`
    if (colors.color1) css += `  --color1: ${colors.color1};\n`
    if (colors.color2) css += `  --color2: ${colors.color2};\n`
    if (colors.color3) css += `  --color3: ${colors.color3};\n`
    if (colors.color4) css += `  --color4: ${colors.color4};\n`
    css += `}\n\n`

    // Add element styles
    Object.entries(elementStyles).forEach(([element, style]) => {
      css += `${element === "specialParagraph" ? ".special-paragraph" : element} {\n`
      Object.entries(style).forEach(([prop, value]) => {
        css += `  ${prop}: ${value};\n`
      })
      css += `}\n\n`
    })

    return css
  }

  const handleSave = async () => {
    if (!templateName) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a template name"
      })
      return
    }

    const css = generateCSS()
    const template = {
      name: templateName,
      ...colors,
      css
    }

    const { error } = await supabase
      .from('templates')
      .upsert({
        id: templateId,
        ...template
      })

    if (error) {
      console.error('Error saving template:', error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save template"
      })
    } else {
      toast({
        title: "Success",
        description: "Template saved successfully"
      })
      onSave?.()
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Template Name</label>
          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Enter template name..."
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
              />
            </div>
          ))}
        </div>
      </div>
      <Tabs defaultValue="content" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="styles">Styles</TabsTrigger>
        </TabsList>
        <TabsContent value="content" className="space-y-4">
          <Textarea
            placeholder="Enter your markdown content here..."
            value={mdContent}
            onChange={(e) => setMdContent(e.target.value)}
            className="min-h-[300px]"
          />
        </TabsContent>
        <TabsContent value="styles">
          <Tabs value={activeElement} onValueChange={(value: string) => setActiveElement(value as ElementType)}>
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="h1">H1</TabsTrigger>
              <TabsTrigger value="h2">H2</TabsTrigger>
              <TabsTrigger value="h3">H3</TabsTrigger>
              <TabsTrigger value="list">List</TabsTrigger>
              <TabsTrigger value="paragraph">Text</TabsTrigger>
              <TabsTrigger value="specialParagraph">Special</TabsTrigger>
            </TabsList>
            <StyleEditor 
              style={elementStyles[activeElement]} 
              onChange={handleStyleChange}
            />
          </Tabs>
        </TabsContent>
      </Tabs>
      <Button onClick={handleSave} className="w-full">Save Template</Button>
    </div>
  )
} 