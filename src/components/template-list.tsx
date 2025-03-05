"use client"

import React, { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Edit, Eye, Trash2, Copy, Search, ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import { createClient } from '@supabase/supabase-js'
import { useToast } from "@/hooks/use-toast"
import { TRANSLATIONS } from "@/lib/translations"
import { Input } from "@/components/ui/input"
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
  logo_url?: string
}

interface TemplateListProps {
  templates: Template[]
  onSelect: (id: string) => void
  onDelete?: () => void
}

export function TemplateList({ templates, onSelect, onDelete }: TemplateListProps) {
  const { toast } = useToast()
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [templatesPerPage] = useState(5)

  // Apply search filter to templates
  const filteredTemplates = templates.filter(template => 
    template.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Calculate pagination
  const indexOfLastTemplate = currentPage * templatesPerPage
  const indexOfFirstTemplate = indexOfLastTemplate - templatesPerPage
  const currentTemplates = filteredTemplates.slice(indexOfFirstTemplate, indexOfLastTemplate)
  const totalPages = Math.ceil(filteredTemplates.length / templatesPerPage)

  // Reset to first page when search term changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/templates/${id}`, {
        method: 'DELETE'
      });

      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        responseData = { error: responseText };
      }

      if (!response.ok) {
        console.error('Error deleting template:', responseData);
        
        // Provide a more specific error message if available
        const errorMessage = responseData.error || TRANSLATIONS.failedToDeleteTemplate || "Failed to delete template";
        
        toast({
          variant: "destructive",
          title: TRANSLATIONS.error,
          description: errorMessage
        });
      } else {
        toast({
          title: TRANSLATIONS.success,
          description: TRANSLATIONS.templateDeletedSuccessfully || "Template was deleted successfully"
        });
        
        // Refresh the list after deletion
        onDelete?.();
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      toast({
        variant: "destructive",
        title: TRANSLATIONS.error,
        description: error instanceof Error ? error.message : TRANSLATIONS.failedToDeleteTemplate || "Failed to delete template"
      });
    }
  }

  const handleDuplicate = async (template: Template) => {
    const response = await fetch('/api/templates/duplicate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(template)
    });

    if (!response.ok) {
      console.error('Error duplicating template:', await response.text())
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
    <div className="flex flex-col space-y-4" dir="rtl">
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
          <Search className="h-4 w-4 text-gray-400" />
        </div>
        <Input
          type="search"
          className="ps-10"
          placeholder={TRANSLATIONS.searchTemplates || "Search templates..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      
      {/* Templates List with scrollable container */}
      <div className="overflow-auto max-h-[calc(100vh-300px)] rounded-md border border-gray-200 p-1">
        <div className="space-y-2">
          {currentTemplates.length > 0 ? (
            currentTemplates.map((template) => (
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
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => handleDuplicate(template)}
                      title={TRANSLATIONS.duplicate}
                    >
                      <Copy className="h-4 w-4" />
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
            ))
          ) : (
            <div className="text-center py-4 text-gray-500">
              {searchTerm 
                ? (TRANSLATIONS.noTemplatesFound || "No templates found") 
                : (TRANSLATIONS.noTemplates || "No templates available")}
            </div>
          )}
        </div>
      </div>

      {/* Pagination Controls */}
      {filteredTemplates.length > 0 && (
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-500">
            {TRANSLATIONS.showing || "Showing"} {indexOfFirstTemplate + 1}-
            {Math.min(indexOfLastTemplate, filteredTemplates.length)} {TRANSLATIONS.of || "of"} {filteredTemplates.length}
          </div>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prevPage => Math.max(prevPage - 1, 1))}
              disabled={currentPage === 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="flex items-center px-2">
              <span className="text-sm">{currentPage}/{totalPages}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prevPage => Math.min(prevPage + 1, totalPages))}
              disabled={currentPage === totalPages}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
} 