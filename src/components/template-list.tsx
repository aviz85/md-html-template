"use client"

import React from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Edit, Eye, Trash2 } from "lucide-react"
import Link from "next/link"
import { createClient } from '@supabase/supabase-js'
import { useToast } from "@/hooks/use-toast"
import { TRANSLATIONS } from "@/lib/translations"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Template {
  id: string
  name: string
  color1?: string
  color2?: string
  color3?: string
  color4?: string
  css: string
  logo_url?: string
}

interface TemplateListProps {
  templates: Template[]
  onSelect: (id: string) => void
  onDelete?: () => void
}

export function TemplateList({ templates, onSelect, onDelete }: TemplateListProps) {
  const { toast } = useToast()

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('templates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting template:', error)
      toast({
        variant: "destructive",
        title: TRANSLATIONS.error,
        description: TRANSLATIONS.failedToSaveTemplate
      })
    } else {
      toast({
        title: TRANSLATIONS.success,
        description: TRANSLATIONS.templateSavedSuccessfully
      })
      onDelete?.()
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      {templates.map((template) => (
        <Card key={template.id} className="p-4">
          <div className="flex justify-between items-center">
            <div className="font-medium">{template.name}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" asChild>
                <Link href={`/templates/${template.id}/preview`}>
                  <Eye className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" size="icon" onClick={() => onSelect(template.id)}>
                <Edit className="h-4 w-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{TRANSLATIONS.areYouSure}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {TRANSLATIONS.deleteTemplateConfirm}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{TRANSLATIONS.cancel}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(template.id)}>
                      {TRANSLATIONS.delete}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
} 