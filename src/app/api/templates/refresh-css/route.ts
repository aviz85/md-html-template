import { createClient } from '@supabase/supabase-js'
import { generateHtmlTemplate } from '@/lib/constants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const { templateId } = await req.json()
    
    if (!templateId) {
      return new Response('Template ID is required', { status: 400 })
    }

    // Get template
    const { data: template, error: templateError } = await supabase
      .from('templates')
      .select('element_styles')
      .eq('id', templateId)
      .single()

    if (templateError) {
      console.error('Error fetching template:', templateError)
      return new Response('Error fetching template', { status: 500 })
    }

    if (!template?.element_styles) {
      return new Response('No element styles found', { status: 404 })
    }

    // Generate CSS from element styles
    const css = generateHtmlTemplate({ elementStyles: template.element_styles }).css

    // Update template with new CSS
    const { error: updateError } = await supabase
      .from('templates')
      .update({ css })
      .eq('id', templateId)

    if (updateError) {
      console.error('Error updating template CSS:', updateError)
      return new Response('Error updating template CSS', { status: 500 })
    }

    return new Response(JSON.stringify({ css }), {
      headers: { 'content-type': 'application/json' }
    })
  } catch (error) {
    console.error('Error refreshing CSS:', error)
    return new Response('Error refreshing CSS', { status: 500 })
  }
} 