import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const template = await req.json()
    
    // First save the template
    const { data: savedTemplate, error: templateError } = await supabase
      .from('templates')
      .upsert({
        id: template.id,
        name: template.name,
        template_gsheets_id: template.template_gsheets_id,
        header_content: template.header_content,
        footer_content: template.footer_content,
        custom_fonts: template.custom_fonts,
        css: template.css,
        color1: template.color1,
        color2: template.color2,
        color3: template.color3,
        color4: template.color4,
      })
      .select()
      .single()

    if (templateError) {
      console.error('Error saving template:', templateError)
      return new Response('Error saving template', { status: 500 })
    }

    // Then save the template contents
    const contents = []
    
    if (template.opening_page_content) {
      contents.push({
        template_id: savedTemplate.id,
        content_name: 'opening_page',
        md_content: template.opening_page_content
      })
    }
    
    if (template.closing_page_content) {
      contents.push({
        template_id: savedTemplate.id,
        content_name: 'closing_page',
        md_content: template.closing_page_content
      })
    }

    if (template.custom_contents?.length > 0) {
      template.custom_contents.forEach((content: any) => {
        contents.push({
          template_id: savedTemplate.id,
          content_name: `custom_${content.name}`,
          md_content: content.content
        })
      })
    }

    if (contents.length > 0) {
      const { error: contentsError } = await supabase
        .from('template_contents')
        .upsert(contents, {
          onConflict: 'template_id,content_name'
        })

      if (contentsError) {
        console.error('Error saving template contents:', contentsError)
        return new Response('Error saving template contents', { status: 500 })
      }
    }

    return new Response('Template saved successfully')
  } catch (error) {
    console.error('Error:', error)
    return new Response('Error saving template', { status: 500 })
  }
} 