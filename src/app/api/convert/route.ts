import { createClient } from '@supabase/supabase-js';
import { marked } from 'marked';
import { 
  convertMarkdownToHtml,
  extractUsedFonts, 
  generateGoogleFontsUrl, 
  generateHtmlTemplate,
  generateCustomFontFaces 
} from "@/lib/constants";
import { ElementStyle } from "@/types"
import { NextResponse } from 'next/server';

interface Template {
  id: string
  name: string
  css: string
  template_gsheets_id?: string
  header_content?: string
  footer_content?: string
  opening_page_content?: string
  closing_page_content?: string
  custom_contents?: Array<{
    name: string
    content: string
  }>
  custom_fonts?: Array<{
    name: string
    file_path: string
    font_family: string
    format: string
  }>
}

interface TemplateData extends Template {
  logo_path?: string
  element_styles?: {
    header?: ElementStyle
  }
  header?: string
  footer?: string
  customContents?: Array<{
    name: string
    content: string
  }>
  show_logo?: boolean
  logo_position?: string
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

    const { markdowns, template } = await req.json()
    console.log('Received request:', { markdowns, template })
    
    // Handle both array and single string inputs
    const isArray = Array.isArray(markdowns)
    const markdownsArray = isArray ? markdowns : [markdowns]
    
    if (!markdownsArray.length) {
      throw new Error('No markdown content provided')
    }

    let templateData: TemplateData | null = null

    // אם נשלח template מלא עם CSS, נשתמש בו ישירות
    if (template.css) {
      console.log('Using provided template with CSS')
      templateData = template as TemplateData
    } 
    // אם נשלח template_gsheets_id, נחפש בדאטהבייס
    else if (template.id) {
      console.log('Fetching template by gsheets_id:', template.id)
      
      const { data: foundTemplate, error: templateError } = await supabase
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
        .eq('template_gsheets_id', template.id)
        .single()

      if (templateError) {
        console.error('DB Error:', templateError)
        throw new Error(`Template not found: ${templateError.message}`)
      }
      if (!foundTemplate) {
        console.error('No data returned from DB')
        throw new Error('Template not found: no data returned')
      }

      templateData = foundTemplate

      // Fetch logo data if template has an id
      if (templateData) {
        const { data: logoData } = await supabase
          .from('logos')
          .select('file_path')
          .eq('template_id', templateData.id)
          .single()

        console.log('Logo data:', logoData)

        if (logoData) {
          const { data: { publicUrl } } = supabase.storage
            .from('storage')
            .getPublicUrl(logoData.file_path)
          
          console.log('Logo URL:', publicUrl)
          templateData.logo_path = publicUrl
        }

        // Fetch template contents
        const { data: contents, error: contentsError } = await supabase
          .from('template_contents')
          .select('content_name, md_content')
          .eq('template_id', templateData.id)

        if (contentsError) {
          console.error('Error fetching template contents:', contentsError)
        } else if (contents?.length) {
          templateData.header = contents.find(c => c.content_name === 'header')?.md_content
          templateData.footer = contents.find(c => c.content_name === 'footer')?.md_content
          templateData.customContents = contents.filter(c => !['header', 'footer'].includes(c.content_name))
            .map(c => ({ name: c.content_name.replace('custom_', ''), content: c.md_content }))
        }
      }
    }

    if (!templateData) {
      throw new Error('Invalid template data - missing template_gsheets_id or css')
    }

    console.log('Using template data:', templateData)

    // הוספת עמודי פתיחה וסיום למערך ה-markdowns רק אם התקבל מערך
    const finalMarkdowns = []
    if (isArray) {
      if (templateData.opening_page_content) {
        finalMarkdowns.push(templateData.opening_page_content)
      }
      finalMarkdowns.push(...markdownsArray)
      if (templateData.closing_page_content) {
        finalMarkdowns.push(templateData.closing_page_content)
      }
    } else {
      finalMarkdowns.push(...markdownsArray)
    }

    // Generate @font-face rules
    const customFontFaces = templateData.custom_fonts?.length 
      ? generateCustomFontFaces(templateData.custom_fonts)
      : ''

    console.log('\nGenerated @font-face rules:', customFontFaces)

    // Convert each markdown to HTML
    const htmls = await Promise.all(finalMarkdowns.map(async (markdown) => {
      let finalHeaderContent = templateData!.header || ''
      console.log('Logo check:', {
        logo_path: templateData?.logo_path,
        show_logo: templateData?.show_logo,
        logo_position: templateData?.logo_position
      })
      
      if (templateData?.logo_path && templateData.show_logo !== false) {
        const logoPosition = templateData.logo_position || 'top-right'
        const logoWidth = templateData.element_styles?.header?.logoWidth || '100px'
        const logoHeight = templateData.element_styles?.header?.logoHeight || 'auto'
        const logoMargin = templateData.element_styles?.header?.logoMargin || '1rem'

        console.log('Logo settings:', {
          logoPosition,
          logoWidth,
          logoHeight,
          logoMargin
        })

        const getPositionStyle = (position: string) => {
          switch(position) {
            case 'top-left': return 'left: 0; top: 0;'
            case 'top-center': return 'left: 50%; transform: translateX(-50%); top: 0;'
            case 'top-right': return 'right: 0; top: 0;'
            case 'bottom-left': return 'left: 0; bottom: 0;'
            case 'bottom-center': return 'left: 50%; transform: translateX(-50%); bottom: 0;'
            case 'bottom-right': return 'right: 0; bottom: 0;'
            default: return 'right: 0; top: 0;'
          }
        }

        finalHeaderContent = `<div class="header" style="position: relative;">
          <img 
            src="${templateData.logo_path}" 
            style="
              position: absolute; 
              ${getPositionStyle(logoPosition)}
              width: ${logoWidth};
              height: ${logoHeight};
              object-fit: contain;
              margin: ${logoMargin};
            "
          />
          ${templateData.header ? await marked.parse(templateData.header) : ''}
        </div>`
        
        console.log('Final header content:', finalHeaderContent)
      }

      const combinedHtml = await convertMarkdownToHtml(
        markdown, 
        finalHeaderContent, 
        templateData!.footer || '',
        templateData!.customContents
      )
      const usedFonts = extractUsedFonts(templateData!.css)
      const googleFontsUrl = generateGoogleFontsUrl(usedFonts)
      
      return generateHtmlTemplate(
        combinedHtml, 
        templateData!.css, 
        googleFontsUrl,
        customFontFaces
      )
    }))

    console.log('Generated HTMLs:', htmls.length)

    // Return array or single string based on input type
    return NextResponse.json({ 
      htmls: isArray ? htmls : htmls[0]
    })
  } catch (error) {
    console.error('Error converting markdown:', error)
    return new Response(String(error), { status: 500 })
  }
}