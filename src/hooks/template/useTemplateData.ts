import { useState, useEffect } from "react"
import { Template, ElementType } from "@/types"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase-client"
import { TRANSLATIONS } from "@/lib/translations"

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
        const styles = data.elementStyles || data.element_styles
        
        setTemplate({
          ...data,
          elementStyles: styles || elementStyles
        })
        
        if (styles) {
          setElementStyles(styles)
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

  const validateTemplate = (template: Template) => {
    const warnings: string[] = [];
    
    // Validate template name
    if (!template.name) {
      warnings.push('שם תבנית הוא שדה חובה');
    } else if (template.name.length < 2) {
      warnings.push('שם תבנית חייב להכיל לפחות 2 תווים');
    } else if (template.name.length > 100) {
      warnings.push('שם תבנית ארוך מדי (מקסימום 100 תווים)');
    }
    
    return warnings;
  }

  const saveTemplate = async () => {
    if (!template) return

    setIsLoading(true)
    try {
      // Check for validation issues but don't block saving
      const warnings = validateTemplate(template);
      const hasWarnings = warnings.length > 0;
      
      const { error } = await supabase
        .from("templates")
        .update({
          ...template,
          element_styles: elementStyles
        })
        .eq("id", template.id)

      if (error) {
        throw error
      }

      // Show success toast with warning if applicable
      if (hasWarnings) {
        toast({
          variant: "default",
          title: TRANSLATIONS.templateSavedWithWarnings || "התבנית נשמרה עם אזהרות",
          description: (TRANSLATIONS.templateHasWarnings || "התבנית נשמרה אך יש בה אזהרות:") + 
                      "\n" + warnings.join(", ")
        });
      } else {
        toast({
          title: "Template saved",
          description: "Your template has been saved successfully."
        });
      }
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