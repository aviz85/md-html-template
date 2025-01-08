import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const template = await req.json()
    const { error } = await supabase
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

    if (error) {
      console.error('Error saving template:', error)
      return new Response('Error saving template', { status: 500 })
    }

    return new Response('Template saved successfully')
  } catch (error) {
    console.error('Error:', error)
    return new Response('Error saving template', { status: 500 })
  }
} 