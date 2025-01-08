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
  breaks: true, // Convert line breaks to <br>
  gfm: true // Use GitHub Flavored Markdown
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { markdown, template } = await req.json()
    
    // Load template with custom fonts
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

    console.log('Template data:', templateData)
    console.log('Custom fonts:', templateData.custom_fonts)

    const combinedHtml = await convertMarkdownToHtml(markdown, templateData.header_content, templateData.footer_content)
    const usedFonts = extractUsedFonts(templateData.css)
    const googleFontsUrl = generateGoogleFontsUrl(usedFonts)
    
    // Generate @font-face rules for custom fonts
    const customFontFaces = templateData.custom_fonts?.length 
      ? generateCustomFontFaces(templateData.custom_fonts)
      : ''

    const html = `<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${googleFontsUrl ? `<link href="${googleFontsUrl}" rel="stylesheet">` : ''}
  <style>
    ${customFontFaces}
    ${templateData.css}
  </style>
</head>
<body>
  ${combinedHtml}
</body>
</html>`

    return new Response(html)
  } catch (error) {
    console.error('Error converting markdown:', error)
    return new Response('Error converting markdown', { status: 500 })
  }
}