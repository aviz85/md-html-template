import { createClient } from '@supabase/supabase-js';
import { marked } from 'marked';
import { 
  convertMarkdownToHtml,
  extractUsedFonts, 
  generateGoogleFontsUrl, 
  generateHtmlTemplate,
  generateCustomFontFaces 
} from "@/lib/constants";

interface Template {
  id: string
  name: string
  css: string
  template_gsheets_id?: string
  header_content?: string
  footer_content?: string
  custom_fonts?: Array<{
    name: string
    file_path: string
    font_family: string
    format: string
  }>
}

interface TemplateData extends Template {
  logo_path?: string
}

// Configure marked with basic options
marked.setOptions({
  breaks: true,
  gfm: true
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    // בדיקת חיבור לסופאבייס
    console.log('Supabase config:', {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    })

    // בדיקת חיבור
    const { data: testData, error: testError } = await supabase
      .from('templates')
      .select('count')
      .limit(1)

    console.log('Connection test:', { testData, testError })

    const { markdown, template } = await req.json()
    console.log('Received request:', { markdown, template })
    
    let templateData: TemplateData | null = null

    // אם נשלח template_id, נחפש לפיו
    if (template.template_id) {
      console.log('Fetching template by template_id:', template.template_id)
      
      // בדיקה אם התבנית קיימת
      const { data: allTemplates, error: listError } = await supabase
        .from('templates')
        .select('id, template_gsheets_id')

      console.log('All templates:', allTemplates)

      const { data, error } = await supabase
        .from('templates')
        .select(`
          *,
          custom_fonts (
            name,
            file_path,
            font_family,
            format
          )
        `)
        .eq('id', template.template_id)
        .single()

      console.log('Supabase response:', { data, error })

      if (error) {
        console.error('DB Error:', error)
        throw new Error(`Template not found: ${error.message}`)
      }
      if (!data) {
        console.error('No data returned from DB')
        throw new Error('Template not found: no data returned')
      }

      templateData = data
      console.log('Found template:', templateData)
    } 
    // אם נשלח template מלא, נשתמש בו ישירות
    else if (template.css) {
      console.log('Using provided template')
      templateData = template as TemplateData
    } 
    // אם נשלח id רגיל
    else if (template.id) {
      console.log('Fetching template by id:', template.id)
      const { data, error } = await supabase
        .from('templates')
        .select(`
          *,
          custom_fonts (
            name,
            file_path,
            font_family,
            format
          )
        `)
        .eq('id', template.id)
        .single()

      if (error) {
        console.error('DB Error:', error)
        throw new Error('Template not found')
      }
      if (!data) {
        console.error('No data returned from DB')
        throw new Error('Template not found')
      }

      templateData = data
    } else {
      throw new Error('Invalid template data - missing template_gsheets_id, css or id')
    }

    if (!templateData) {
      throw new Error('Template data is null')
    }

    console.log('Using template data:', templateData)

    // Generate @font-face rules
    const customFontFaces = templateData.custom_fonts?.length 
      ? generateCustomFontFaces(templateData.custom_fonts)
      : ''

    console.log('\nGenerated @font-face rules:', customFontFaces)

    const combinedHtml = await convertMarkdownToHtml(
      markdown, 
      templateData.header_content || '', 
      templateData.footer_content || ''
    )
    const usedFonts = extractUsedFonts(templateData.css)
    const googleFontsUrl = generateGoogleFontsUrl(usedFonts)
    
    const html = generateHtmlTemplate(
      combinedHtml, 
      templateData.css, 
      googleFontsUrl, 
      templateData.logo_path,
      customFontFaces
    )

    console.log('Final HTML:', html)

    return new Response(html)
  } catch (error) {
    console.error('Error converting markdown:', error)
    return new Response(String(error), { status: 500 })
  }
}