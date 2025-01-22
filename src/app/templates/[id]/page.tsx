"use client"

import { TemplateEditor } from "@/components/template-editor"
import { AuthWrapper } from "@/components/auth-wrapper"

export default function TemplatePage({ params }: { params: { id: string } }) {
  return (
    <AuthWrapper>
      <TemplateEditor templateId={params.id} />
    </AuthWrapper>
  )
} 