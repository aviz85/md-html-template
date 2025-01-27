import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { TRANSLATIONS } from '@/lib/translations'

export async function POST(request: Request) {
  try {
    const template = await request.json()

    // Find existing copies
    const { data: existingTemplates, error: fetchError } = await supabaseAdmin
      .from('templates')
      .select('name')
      .like('name', `${template.name} - ${TRANSLATIONS.copy}%`)

    if (fetchError) throw fetchError

    // Determine copy number
    let copyNumber = ''
    if (existingTemplates && existingTemplates.length > 0) {
      const numbers = existingTemplates.map(t => {
        const match = t.name.match(new RegExp(`${template.name} - ${TRANSLATIONS.copy}( (\\d+))?$`))
        return match ? (match[2] ? parseInt(match[2]) : 1) : 0
      })
      const maxNumber = Math.max(...numbers)
      copyNumber = maxNumber > 0 ? ` ${maxNumber + 1}` : ''
    }

    // Create new template
    const { id: oldId, ...templateWithoutId } = template
    const newTemplate = {
      ...templateWithoutId,
      name: `${template.name} - ${TRANSLATIONS.copy}${copyNumber}`,
      template_gsheets_id: undefined,
      form_id: undefined
    }

    // Insert new template and get its ID
    const { data: insertedTemplate, error: insertError } = await supabaseAdmin
      .from('templates')
      .insert(newTemplate)
      .select()
      .single()

    if (insertError) throw insertError

    // Get template contents
    const { data: templateContents, error: contentsError } = await supabaseAdmin
      .from('template_contents')
      .select('content_name, md_content')
      .eq('template_id', oldId)

    if (contentsError) throw contentsError

    // Copy template contents if they exist
    if (templateContents && templateContents.length > 0) {
      const newContents = templateContents.map(content => ({
        template_id: insertedTemplate.id,
        content_name: content.content_name,
        md_content: content.md_content
      }))

      const { error: copyError } = await supabaseAdmin
        .from('template_contents')
        .insert(newContents)

      if (copyError) throw copyError
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error duplicating template:', error)
    return NextResponse.json(
      { error: 'Failed to duplicate template' },
      { status: 500 }
    )
  }
} 