import React, { useEffect, useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useTemplate } from "@/contexts/TemplateContext"
import { TRANSLATIONS } from "@/lib/translations"
import { ResizableSplitter } from "../ResizableSplitter"
import { Template } from "@/types"

export function ContentTab() {
  const { template, setTemplate, previewHtml, generatePreview } = useTemplate()
  const [mdContent, setMdContent] = useState("")
  const [sidebarWidth, setSidebarWidth] = useState(200)
  
  useEffect(() => {
    if (template) {
      // Initialize template data
      setMdContent(template.opening_page_content || "")
    }
  }, [template])
  
  useEffect(() => {
    // Sync changes with template
    if (template) {
      setTemplate((prev: Template | null) => prev ? {
        ...prev,
        opening_page_content: mdContent
      } : null)
    }
  }, [mdContent, setTemplate])
  
  const handlePreview = async () => {
    await generatePreview()
  }
  
  return (
    <div className="flex-1 flex">
      <div style={{ width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` }} className="flex flex-col border-r">
        <div className="p-4">
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium">
                {TRANSLATIONS.templateName}
              </label>
              <Input
                value={template?.name || ""}
                onChange={(e) => setTemplate((prev: Template | null) => prev ? { ...prev, name: e.target.value } : null)}
                placeholder={TRANSLATIONS.templateNamePlaceholder}
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                {TRANSLATIONS.gsheetsId}
              </label>
              <Input
                value={template?.template_gsheets_id || ""}
                onChange={(e) => setTemplate((prev: Template | null) => prev ? { ...prev, template_gsheets_id: e.target.value } : null)}
                placeholder={TRANSLATIONS.gsheetsIdPlaceholder}
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                {TRANSLATIONS.formId}
              </label>
              <Input
                value={template?.form_id || ""}
                onChange={(e) => setTemplate((prev: Template | null) => prev ? { ...prev, form_id: e.target.value } : null)}
                placeholder={TRANSLATIONS.formIdPlaceholder}
                dir="ltr"
              />
            </div>
          </div>
        </div>
      </div>
      
      <ResizableSplitter onResize={setSidebarWidth} />
      
      <div className="flex-1 flex">
        <div className="flex-1 flex flex-col p-4">
          <label className="text-sm font-medium">
            {TRANSLATIONS.content}
          </label>
          <div className="mt-1 flex flex-col flex-1">
            <Textarea
              value={mdContent}
              onChange={(e) => setMdContent(e.target.value)}
              className="flex-1 font-mono resize-none"
              placeholder={TRANSLATIONS.contentPlaceholder}
              dir="rtl"
            />
            <Button 
              className="mt-2 self-end" 
              onClick={handlePreview}
            >
              {TRANSLATIONS.preview}
            </Button>
          </div>
        </div>
        
        <div className="flex-1 flex flex-col p-4 border-l">
          <label className="text-sm font-medium">
            {TRANSLATIONS.preview}
          </label>
          <div className="mt-1 flex-1 border rounded-md">
            <iframe
              srcDoc={previewHtml}
              className="w-full h-full"
              title="Preview"
            />
          </div>
        </div>
      </div>
    </div>
  )
} 