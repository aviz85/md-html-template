"use client"

import React from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { TRANSLATIONS } from "@/lib/translations"
import { TemplateEditorProps } from "@/types"
import { TemplateProvider } from "@/contexts/TemplateContext"
import { ContentTab } from "./tabs/ContentTab"
import { StylesTab } from "./tabs/StylesTab"
import { useTemplate } from "@/contexts/TemplateContext"

function EditorContent() {
  const { saveTemplate } = useTemplate()
  const { toast } = useToast()
  
  const handleSave = async () => {
    try {
      await saveTemplate()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error saving template",
        description: error.message
      })
    }
  }
  
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex justify-between items-center">
        <h1 className="text-xl font-bold">{TRANSLATIONS.templateEditor}</h1>
        <Button onClick={handleSave}>
          {TRANSLATIONS.save}
        </Button>
      </div>
      
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="content" className="w-full h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="content">{TRANSLATIONS.content}</TabsTrigger>
            <TabsTrigger value="microCopy">{TRANSLATIONS.microCopy}</TabsTrigger>
            <TabsTrigger value="styles">{TRANSLATIONS.styles}</TabsTrigger>
            <TabsTrigger value="email">תבנית מייל</TabsTrigger>
            <TabsTrigger value="status">סטטוס שליחות</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          </TabsList>
          
          <div className="flex-1 overflow-hidden">
            <TabsContent value="content" className="h-full">
              <ContentTab />
            </TabsContent>
            
            <TabsContent value="microCopy" className="h-full">
              {/* MicroCopyTab will be implemented in the future */}
              <div className="p-4">Micro Copy Tab Coming Soon</div>
            </TabsContent>
            
            <TabsContent value="styles" className="h-full">
              <StylesTab />
            </TabsContent>
            
            <TabsContent value="email" className="h-full">
              {/* EmailTab will be implemented in the future */}
              <div className="p-4">Email Tab Coming Soon</div>
            </TabsContent>
            
            <TabsContent value="status" className="h-full">
              {/* StatusTab will be implemented in the future */}
              <div className="p-4">Status Tab Coming Soon</div>
            </TabsContent>
            
            <TabsContent value="whatsapp" className="h-full">
              {/* WhatsappTab will be implemented in the future */}
              <div className="p-4">WhatsApp Tab Coming Soon</div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}

export function TemplateEditor({ templateId, onSave }: TemplateEditorProps) {
  return (
    <TemplateProvider templateId={templateId}>
      <EditorContent />
    </TemplateProvider>
  )
} 