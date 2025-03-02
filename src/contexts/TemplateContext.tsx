import React, { createContext, useContext, useState, ReactNode } from "react"
import { Template, TemplateContextType, ElementType } from "@/types"
import { useTemplateData } from "@/hooks/template/useTemplateData"
import { useEditorPreview } from "@/hooks/template/useEditorPreview"

const TemplateContext = createContext<TemplateContextType | undefined>(undefined)

export function TemplateProvider({ 
  children, 
  templateId 
}: { 
  children: ReactNode
  templateId?: string 
}) {
  const { 
    template, 
    setTemplate, 
    elementStyles, 
    setElementStyles, 
    isLoading,
    saveTemplate 
  } = useTemplateData(templateId)
  
  const [activeElement, setActiveElement] = useState<ElementType>("body")
  const { previewHtml, setPreviewHtml, generatePreview } = useEditorPreview()
  const [mdContent, setMdContent] = useState("")
  const [headerContent, setHeaderContent] = useState("")
  const [footerContent, setFooterContent] = useState("")
  
  const generatePreviewWrapper = async () => {
    await generatePreview(template, mdContent, headerContent, footerContent)
  }
  
  const contextValue: TemplateContextType = {
    template,
    setTemplate,
    elementStyles,
    setElementStyles,
    activeElement,
    setActiveElement,
    previewHtml,
    setPreviewHtml,
    isLoading,
    saveTemplate,
    generatePreview: generatePreviewWrapper
  }
  
  return (
    <TemplateContext.Provider value={contextValue}>
      {children}
    </TemplateContext.Provider>
  )
}

export function useTemplate() {
  const context = useContext(TemplateContext)
  
  if (context === undefined) {
    throw new Error("useTemplate must be used within a TemplateProvider")
  }
  
  return context
} 