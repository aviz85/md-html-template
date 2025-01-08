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
    const { markdown, template } = await req.json()
    
    const { data: templateData } = await supabase
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

    if (!templateData) {
      return new Response('Template not found', { status: 404 })
    }

    console.log('Raw template data from DB:', {
      id: templateData.id,
      custom_fonts: templateData.custom_fonts?.map((f: { name: string, file_path: string, font_family: string, format: string }) => ({
        name: f.name,
        file_path: f.file_path,
        font_family: f.font_family,
        format: f.format
      }))
    })

    // Generate @font-face rules
    const customFontFaces = templateData.custom_fonts?.length 
      ? generateCustomFontFaces(templateData.custom_fonts.map((font: { name: string, file_path: string, font_family: string, format: string }) => ({
          ...font,
          file_path: font.file_path
        })))
      : ''

    console.log('\nGenerated @font-face rules:', customFontFaces)

    const combinedHtml = await convertMarkdownToHtml(markdown, templateData.header_content, templateData.footer_content)
    const usedFonts = extractUsedFonts(templateData.css)
    const googleFontsUrl = generateGoogleFontsUrl(usedFonts)
    
    console.log('Generated @font-face rules:', customFontFaces)

    const html = `<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${googleFontsUrl ? `<link href="${googleFontsUrl}" rel="stylesheet">` : ''}
  <style>
    /* Custom Fonts */
    ${customFontFaces}

    /* Template Styles */
    ${templateData.css}
  </style>
</head>
<body>
  ${combinedHtml}
</body>
</html>`

    console.log('Final HTML:', html)

    return new Response(html)
  } catch (error) {
    console.error('Error converting markdown:', error)
    return new Response('Error converting markdown', { status: 500 })
  }
}