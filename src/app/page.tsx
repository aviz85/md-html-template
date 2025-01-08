"use client"

import { createClient } from '@supabase/supabase-js'
import { TemplateList } from '@/components/template-list'
import { TemplateEditor } from '@/components/template-editor'
import { Button } from '@/components/ui/button'
import { useState, useEffect } from 'react'
import { TRANSLATIONS } from '@/lib/translations'

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
}

export default function Home() {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .order('name')

    if (error) {
      console.error('Error loading templates:', error)
      return
    }

    setTemplates(data || [])
  }

  return (
    <main className="container mx-auto p-4" dir="rtl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">{TRANSLATIONS.templateManager}</h1>
        <Button onClick={() => {
          setSelectedTemplateId(null)
          setIsCreating(true)
        }}>{TRANSLATIONS.createNewTemplate}</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-2xl font-semibold mb-4">{TRANSLATIONS.templates}</h2>
          <TemplateList 
            templates={templates} 
            onSelect={setSelectedTemplateId}
            onDelete={loadTemplates}
          />
        </div>
        <div>
          <h2 className="text-2xl font-semibold mb-4">
            {isCreating ? TRANSLATIONS.newTemplate : selectedTemplateId ? TRANSLATIONS.editTemplate : TRANSLATIONS.preview}
          </h2>
          <div className="border rounded-lg p-4 min-h-[500px]">
            {(isCreating || selectedTemplateId) && (
              <TemplateEditor 
                key={selectedTemplateId || 'new'} 
                templateId={selectedTemplateId || undefined} 
                onSave={() => {
                  loadTemplates()
                }}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  )
} 