import { useState, useEffect } from "react"
import { Template, ElementType } from "@/types"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase-client"

export function useTemplateData(templateId?: string) {
  const { toast } = useToast()
  const [template, setTemplate] = useState<Template | null>(null)
  const [isLoading, setIsLoading] = useState(false)
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
    footer: {},
    main: {},
    prose: {}
  })

  const loadTemplate = async (id: string) => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from("templates")
        .select("*")
        .eq("id", id)
        .single()

      if (error) {
        throw error
      }

      if (data) {
        setTemplate(data)
        if (data.elementStyles) {
          setElementStyles(data.elementStyles)
        }
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error loading template",
        description: error.message
      })
    } finally {
      setIsLoading(false)
    }
  }

  const saveTemplate = async () => {
    if (!template) return

    setIsLoading(true)
    try {
      const { error } = await supabase
        .from("templates")
        .update({
          ...template,
          elementStyles
        })
        .eq("id", template.id)

      if (error) {
        throw error
      }

      toast({
        title: "Template saved",
        description: "Your template has been saved successfully."
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error saving template",
        description: error.message
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (templateId) {
      loadTemplate(templateId)
    }
  }, [templateId])

  return {
    template,
    setTemplate,
    elementStyles,
    setElementStyles,
    isLoading,
    loadTemplate,
    saveTemplate
  }
} 