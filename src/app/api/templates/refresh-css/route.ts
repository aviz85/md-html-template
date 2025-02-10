import { createClient } from '@supabase/supabase-js'
import { CSS_PROPERTIES } from '@/lib/constants'
import { ElementStyle } from "@/types"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Function to generate CSS from element styles
function generateCSS(styles: Record<string, ElementStyle>) {
  let css = ''
  
  // Add styles for each element
  Object.entries(styles).forEach(([element, styles]) => {
    if (Object.keys(styles).length === 0) return

    // Convert element name to CSS selector
    const selector = element === 'specialParagraph' ? '.special-paragraph' :
                    element === 'header' ? '.header' :
                    element === 'footer' ? '.footer' :
                    element === 'main' ? '.main' :
                    element === 'prose' ? '.prose' :
                    element

    css += `${selector} {\n`
    
    // Add standard properties
    Object.entries(styles).forEach(([property, value]) => {
      if (!value || property === 'customCss') return // Skip empty values and customCss
      
      // Check if this is a valid CSS property
      const cssProperty = CSS_PROPERTIES[property as keyof typeof CSS_PROPERTIES]
      if (cssProperty) {
        css += `  ${cssProperty}: ${value};\n`
      }
    })
    
    // Add custom CSS last (so it can override standard properties)
    if (styles.customCss) {
      css += `  ${styles.customCss}\n`
    }
    
    css += '}\n\n'
  })
  
  return css
}

export async function POST(req: Request) {
  try {
    const { templateId } = await req.json()
    
    if (!templateId) {
      return new Response('Template ID is required', { status: 400 })
    }

    // Get template with element styles
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

    console.log('Element styles:', template.element_styles)

    // Generate CSS directly from element styles
    const css = generateCSS(template.element_styles)
    
    console.log('Generated CSS:', css)

    // Update template with new CSS
    const { error: updateError } = await supabase
      .from('templates')
      .update({ css })
      .eq('id', templateId)

    if (updateError) {
      console.error('Error updating template CSS:', updateError)
      return new Response('Error updating template CSS', { status: 500 })
    }

    // Verify the update
    const { data: verifyData, error: verifyError } = await supabase
      .from('templates')
      .select('css')
      .eq('id', templateId)
      .single()

    if (verifyError) {
      console.error('Error verifying CSS update:', verifyError)
    } else {
      console.log('Verified CSS in database:', verifyData?.css)
    }

    return new Response(JSON.stringify({ css }), {
      headers: { 'content-type': 'application/json' }
    })
  } catch (error) {
    console.error('Error refreshing CSS:', error)
    return new Response('Error refreshing CSS', { status: 500 })
  }
} 