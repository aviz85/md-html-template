"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Edit, Eye, Trash2 } from "lucide-react"
import Link from "next/link"
import { createClient } from '@supabase/supabase-js'
import { useToast } from "@/hooks/use-toast"
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
        title: "Error",
        description: "Failed to delete template"
      })
    } else {
      toast({
        title: "Success",
        description: "Template deleted successfully"
      })
      onDelete?.()
    }
  }

  return (
    <div className="space-y-4">
      {templates.map((template) => (
        <Card key={template.id} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">{template.name}</h3>
              <div className="flex gap-2 mt-2">
                {[template.color1, template.color2, template.color3, template.color4]
                  .filter(Boolean)
                  .map((color, i) => (
                    <div
                      key={i}
                      className="w-6 h-6 rounded-full border"
                      style={{ backgroundColor: color }}
                    />
                  ))}
              </div>
            </div>
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
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the template.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(template.id)}>
                      Delete
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