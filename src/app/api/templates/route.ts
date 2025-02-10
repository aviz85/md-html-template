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
        element_styles: template.element_styles,
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

    // Handle custom contents with duplicate check
    if (template.custom_contents?.length > 0) {
      // Use a Map to keep only the latest version of each content
      const contentMap = new Map()
      
      template.custom_contents.forEach((content: any) => {
        const contentName = `custom_${content.name}`
        contentMap.set(contentName, {
          template_id: savedTemplate.id,
          content_name: contentName,
          md_content: content.content
        })
      })

      // Add unique custom contents to the contents array
      contents.push(...Array.from(contentMap.values()))
    }

    if (contents.length > 0) {
      const { error: contentsError } = await supabase
        .from('template_contents')
        .upsert(contents, {
          onConflict: 'template_id,content_name',
          ignoreDuplicates: true
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

export async function PATCH(req: Request) {
  try {
    const { id, custom_fonts } = await req.json()
    
    const { error } = await supabase
      .from('templates')
      .update({ custom_fonts })
      .eq('id', id)

    if (error) {
      console.error('Error updating template fonts:', error)
      return new Response('Error updating template fonts', { status: 500 })
    }

    return new Response('Template fonts updated successfully')
  } catch (error) {
    console.error('Error:', error)
    return new Response('Error updating template', { status: 500 })
  }
}

export async function GET() {
  try {
    const { data: templates, error } = await supabase
      .from('templates')
      .select(`
        *,
        template_contents (
          id,
          content_name,
          md_content,
          created_at
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching templates:', error)
      return new Response('Error fetching templates', { status: 500 })
    }

    return new Response(JSON.stringify(templates), {
      headers: { 'content-type': 'application/json' }
    })
  } catch (error) {
    console.error('Error:', error)
    return new Response('Error fetching templates', { status: 500 })
  }
} 