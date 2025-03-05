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
        description: `Failed to load template: ${error.message}`
      })
    } finally {
      setIsLoading(false)
    }
  }

  const validateTemplate = (template: Template) => {
    interface ValidationIssue {
      type: 'critical' | 'warning' | 'info';
      message: string;
      field?: string;
      category: string;
    }
    
    const issues: ValidationIssue[] = [];
    
    // Validate template name (critical)
    if (!template.name) {
      issues.push({
        type: 'critical',
        message: 'שם תבנית הוא שדה חובה',
        field: 'name',
        category: 'general'
      });
    } else if (template.name.length < 2) {
      issues.push({
        type: 'warning',
        message: 'שם תבנית חייב להכיל לפחות 2 תווים',
        field: 'name',
        category: 'general'
      });
    } else if (template.name.length > 100) {
      issues.push({
        type: 'warning',
        message: 'שם תבנית ארוך מדי (מקסימום 100 תווים)',
        field: 'name',
        category: 'general'
      });
    }
    
    // Check for email configuration if enabled
    if (template.send_email) {
      if (!template.email_from) {
        issues.push({
          type: 'critical',
          message: 'כתובת שולח האימייל חסרה',
          field: 'email_from',
          category: 'email'
        });
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(template.email_from)) {
        issues.push({
          type: 'warning',
          message: 'כתובת האימייל אינה תקינה',
          field: 'email_from',
          category: 'email'
        });
      }
      
      if (!template.email_subject) {
        issues.push({
          type: 'warning',
          message: 'נושא האימייל חסר',
          field: 'email_subject',
          category: 'email'
        });
      }
      
      if (!template.email_body) {
        issues.push({
          type: 'warning',
          message: 'תוכן האימייל חסר',
          field: 'email_body',
          category: 'email'
        });
      }
    }
    
    // Check for WhatsApp configuration if enabled
    if (template.send_whatsapp) {
      if (!template.whatsapp_message) {
        issues.push({
          type: 'warning',
          message: 'הודעת וואטסאפ חסרה',
          field: 'whatsapp_message',
          category: 'whatsapp'
        });
      } else if (!template.whatsapp_message.includes('{{id}}')) {
        issues.push({
          type: 'warning',
          message: 'הודעת וואטסאפ חייבת לכלול placeholder {{id}}',
          field: 'whatsapp_message',
          category: 'whatsapp'
        });
      }
    }
    
    // Check elementStyles for common issues
    if (!template.elementStyles) {
      issues.push({
        type: 'critical',
        message: 'הגדרות עיצוב חסרות',
        category: 'styles'
      });
    } else {
      // Check for required style elements
      (['body', 'h1', 'p'] as Array<ElementType>).forEach(element => {
        if (!template.elementStyles[element]) {
          issues.push({
            type: 'warning',
            message: `הגדרת עיצוב חסרה עבור ${element}`,
            field: `elementStyles.${element}`,
            category: 'styles'
          });
        }
      });
    }
    
    // Check if Form ID is provided but not a valid number
    if (template.form_id && !/^\d+$/.test(template.form_id)) {
      issues.push({
        type: 'warning',
        message: 'מזהה טופס חייב להכיל רק ספרות',
        field: 'form_id',
        category: 'forms'
      });
    }
    
    return {
      hasIssues: issues.length > 0,
      hasCritical: issues.some(issue => issue.type === 'critical'),
      issues,
      criticalCount: issues.filter(issue => issue.type === 'critical').length,
      warningCount: issues.filter(issue => issue.type === 'warning').length,
      infoCount: issues.filter(issue => issue.type === 'info').length
    };
  }

  const saveTemplate = async () => {
    if (!template) return

    setIsLoading(true)
    try {
      // Check for validation issues but don't block saving
      const validation = validateTemplate(template);
      
      // Create detailed warning message if issues exist
      let formattedWarnings = '';
      
      if (validation.hasIssues) {
        formattedWarnings = TRANSLATIONS.templateHasWarnings || "התבנית נשמרה עם הבעיות הבאות:";
        
        if (validation.hasCritical) {
          formattedWarnings += `\n\n🔴 בעיות קריטיות (${validation.criticalCount}):`;
          validation.issues
            .filter(issue => issue.type === 'critical')
            .forEach(issue => {
              formattedWarnings += `\n• ${issue.message}`;
              if (issue.field) {
                formattedWarnings += ` (${issue.field})`;
              }
            });
        }
        
        // Group warnings by category
        const warningsByCategory = validation.issues
          .filter(issue => issue.type === 'warning')
          .reduce((acc, issue) => {
            if (!acc[issue.category]) {
              acc[issue.category] = [];
            }
            acc[issue.category].push(issue);
            return acc;
          }, {} as Record<string, typeof validation.issues>);
        
        if (validation.warningCount > 0) {
          formattedWarnings += `\n\n⚠️ אזהרות (${validation.warningCount}):`;
          
          Object.entries(warningsByCategory).forEach(([category, issues]) => {
            formattedWarnings += `\n\n${getCategoryDisplayName(category)}:`;
            
            issues.forEach(issue => {
              formattedWarnings += `\n• ${issue.message}`;
              if (issue.field) {
                formattedWarnings += ` (${issue.field})`;
              }
            });
          });
        }
        
        if (validation.infoCount > 0) {
          formattedWarnings += `\n\nℹ️ מידע (${validation.infoCount}):`;
          validation.issues
            .filter(issue => issue.type === 'info')
            .forEach(issue => {
              formattedWarnings += `\n• ${issue.message}`;
            });
        }
      }
      
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

      // Show success toast with detailed warning if applicable
      if (validation.hasIssues) {
        toast({
          variant: "default",
          title: `${TRANSLATIONS.templateSavedWithWarnings || "התבנית נשמרה עם אזהרות"} (${validation.criticalCount + validation.warningCount})`,
          description: formattedWarnings
        });
      } else {
        toast({
          title: TRANSLATIONS.success || "התבנית נשמרה בהצלחה",
          description: TRANSLATIONS.templateSavedSuccessfully || "התבנית נשמרה בהצלחה"
        });
      }
    } catch (error: any) {
      let errorMessage = "שגיאה בשמירת התבנית";
      
      // Extract more specific error details if possible
      if (error.message) {
        if (error.message.includes("unique constraint")) {
          errorMessage = "שם התבנית כבר קיים במערכת, אנא בחר שם אחר";
        } else if (error.message.includes("not-null")) {
          errorMessage = "חסר שדה חובה. אנא מלא את כל השדות הנדרשים";
        } else if (error.message.includes("foreign key")) {
          errorMessage = "הפניה לרשומה שלא נמצאה במערכת";
        } else {
          errorMessage = `שגיאה בשמירת התבנית: ${error.message}`;
        }
      }
      
      // Add code if available
      if (error.code) {
        errorMessage += ` (קוד שגיאה: ${error.code})`;
      }
      
      toast({
        variant: "destructive",
        title: TRANSLATIONS.error || "שגיאה",
        description: errorMessage
      });
    } finally {
      setIsLoading(false)
    }
  }
  
  // Helper function to get category display names
  const getCategoryDisplayName = (category: string): string => {
    const categoryMap: Record<string, string> = {
      'general': 'כללי',
      'styles': 'עיצוב',
      'email': 'הגדרות מייל',
      'whatsapp': 'הגדרות וואטסאפ',
      'forms': 'טפסים',
      'integration': 'אינטגרציות'
    };
    
    return categoryMap[category] || category;
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