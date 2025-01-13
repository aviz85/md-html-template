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

    // אם נשלח template_id או id, נחפש לפיו
    if (template.template_id || template.id) {
      const searchId = template.template_id || template.id
      console.log('Fetching template by id:', searchId)
      
      // בדיקה אם התבנית קיימת
      const { data: allTemplates, error: listError } = await supabase
        .from('templates')
        .select('id, template_gsheets_id')

      console.log('All templates:', allTemplates)

      // נסה למצוא לפי template_gsheets_id
      let { data: foundTemplate, error: templateError } = await supabase
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
        .eq('template_gsheets_id', searchId)
        .single()

      // אם לא נמצא, נסה למצוא לפי id רגיל
      if (templateError || !foundTemplate) {
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
          .eq('id', searchId)
          .single()
          
        foundTemplate = data
        templateError = error
      }

      if (templateError) {
        console.error('DB Error:', templateError)
        throw new Error(`Template not found: ${templateError.message}`)
      }
      if (!foundTemplate) {
        console.error('No data returned from DB')
        throw new Error('Template not found: no data returned')
      }

      templateData = foundTemplate

      // Initialize content fields as undefined
      templateData.header_content = undefined
      templateData.footer_content = undefined
      templateData.opening_page_content = undefined
      templateData.closing_page_content = undefined
      templateData.custom_contents = []

      // Fetch logo data
      if (!templateData) {
        throw new Error('Template data is null')
      }
      
      const { data: logoData } = await supabase
        .from('logos')
        .select('file_path')
        .eq('template_id', templateData.id)
        .single()

      if (logoData) {
        const { data: { publicUrl } } = supabase.storage
          .from('storage')
          .getPublicUrl(logoData.file_path)
        
        templateData.logo_path = publicUrl
      }

      // Fetch template contents
      const { data: contentsData, error: contentsError } = await supabase
        .from('template_contents')
        .select('content_name, md_content')
        .eq('template_id', templateData!.id)

      if (contentsError) {
        console.error('Error fetching template contents:', contentsError)
      } else if (contentsData) {
        // Map contents to template data
        contentsData.forEach(content => {
          if (!templateData) return
          
          if (content.content_name === 'header') {
            templateData.header_content = content.md_content
          } else if (content.content_name === 'footer') {
            templateData.footer_content = content.md_content
          } else if (content.content_name === 'opening_page') {
            templateData.opening_page_content = content.md_content
          } else if (content.content_name === 'closing_page') {
            templateData.closing_page_content = content.md_content
          } else if (content.content_name.startsWith('custom_')) {
            if (!templateData.custom_contents) templateData.custom_contents = []
            templateData.custom_contents.push({
              name: content.content_name.replace('custom_', ''),
              content: content.md_content
            })
          }
        })
      }

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

    // Convert each markdown document to HTML
    const htmls = await Promise.all(finalMarkdowns.map(async (markdown) => {
      let finalHeaderContent = templateData!.header_content || ''
      if (templateData?.logo_path && templateData.header_content && templateData.element_styles?.header?.showLogo) {
        const logoPosition = templateData.element_styles?.header?.logoPosition || 'top-right'
        const logoWidth = templateData.element_styles?.header?.logoWidth || '100px'
        const logoHeight = templateData.element_styles?.header?.logoHeight || 'auto'
        const logoMargin = templateData.element_styles?.header?.logoMargin || '1rem'

        const getPositionStyle = (position: ElementStyle['logoPosition']) => {
          switch(position) {
            case 'top-left': return 'left: 0; top: 0;'
            case 'top-center': return 'left: 50%; transform: translateX(-50%); top: 0;'
            case 'top-right': return 'right: 0; top: 0;'
            case 'center-left': return 'left: 0; top: 50%; transform: translateY(-50%);'
            case 'center': return 'left: 50%; top: 50%; transform: translate(-50%, -50%);'
            case 'center-right': return 'right: 0; top: 50%; transform: translateY(-50%);'
            case 'bottom-left': return 'left: 0; bottom: 0;'
            case 'bottom-center': return 'left: 50%; transform: translateX(-50%); bottom: 0;'
            case 'bottom-right': return 'right: 0; bottom: 0;'
            default: return 'right: 0; top: 0;'
          }
        }

        finalHeaderContent = `<div style="position: relative;">
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
          ${templateData.header_content}
        </div>`
      }

      const combinedHtml = await convertMarkdownToHtml(
        markdown, 
        finalHeaderContent, 
        templateData!.footer_content || '',
        templateData!.custom_contents
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