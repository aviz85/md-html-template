import { useState } from "react"
import { Template } from "@/types"
import { useToast } from "@/hooks/use-toast"
import { 
  generateHtmlTemplate, 
  extractUsedFonts, 
  generateGoogleFontsUrl, 
  convertMarkdownToHtml,
  generateCustomFontFaces
} from "@/lib/constants"
import { useTemplateStyles } from "./useTemplateStyles"

export function useEditorPreview() {
  const { toast } = useToast()
  const [previewHtml, setPreviewHtml] = useState("")
  const { generateCSS } = useTemplateStyles()
  
  const generatePreview = async (
    template: Template | null, 
    mdContent: string,
    headerContent: string,
    footerContent: string
  ) => {
    if (!template) return
    
    try {
      const generatedCss = generateCSS(template.elementStyles)
      
      // Generate the HTML for the content
      const contentHtml = await convertMarkdownToHtml(mdContent)
      
      // Generate the HTML for the header and footer
      const headerHtml = headerContent ? await convertMarkdownToHtml(headerContent) : ""
      const footerHtml = footerContent ? await convertMarkdownToHtml(footerContent) : ""
      
      // Extract used fonts
      const usedFonts = extractUsedFonts(generatedCss)
      const googleFontsUrl = generateGoogleFontsUrl(usedFonts)
      
      // Generate custom font faces CSS
      const customFontFaces = generateCustomFontFaces(template.custom_fonts || [])
      
      // Generate the complete HTML template
      const html = generateHtmlTemplate(
        contentHtml,
        template.elementStyles,
        googleFontsUrl,
        customFontFaces
      )
      
      setPreviewHtml(html)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error generating preview",
        description: error.message
      })
    }
  }
  
  return {
    previewHtml,
    setPreviewHtml,
    generatePreview
  }
} 