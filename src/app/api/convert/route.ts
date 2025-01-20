import { marked } from 'marked';
import { NextResponse } from 'next/server';
import { processHtmlContent } from '@/lib/utils/file-utils';
import { createClient } from '@supabase/supabase-js';
import { FONT_FAMILIES, extractUsedFonts, generateGoogleFontsUrl, generateCustomFontFaces } from '@/lib/constants';
import { ElementStyle } from '@/types';

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true
});

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TemplateData {
  colors: {
    h1Color: string;
    h2Color: string;
    h3Color: string;
    bodyFontSize: string;
  };
  element_styles?: {
    body?: ElementStyle;
    h1?: ElementStyle;
    h2?: ElementStyle;
    h3?: ElementStyle;
    p?: ElementStyle;
    list?: ElementStyle;
    header?: ElementStyle;
    footer?: ElementStyle;
  };
  logo?: {
    url: string;
    showOnAllPages: boolean;
  };
  opening_page_content?: string;
  closing_page_content?: string;
  custom_fonts?: Array<{
    name: string;
    file_path: string;
    font_family: string;
    format: string;
  }>;
}

// Convert ElementStyle object to CSS string
const styleToString = (style?: ElementStyle): string => {
  if (!style) return '';
  
  return Object.entries(style)
    .filter(([key]) => key !== 'customCss') // Handle customCss separately
    .map(([key, value]) => {
      // Convert camelCase to kebab-case
      const property = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      return `${property}: ${value};`;
    })
    .join(' ');
};

// Default styles with template colors and element styles
const getStyles = (data: TemplateData) => {
  const bodyFontSize = '16px';
  const bodyFontFamily = "'Rubik', Arial, sans-serif";
  const bodyColor = '#333';
  const bodyLineHeight = '1.6';

  return {
    body: `
      direction: rtl;
      font-family: ${bodyFontFamily};
      font-size: ${bodyFontSize};
      line-height: ${bodyLineHeight};
      color: ${bodyColor};
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    `,
    h1: `
      color: ${data.element_styles?.h1?.color || '#4d7d89'};
      font-family: ${data.element_styles?.h1?.fontFamily || "'David Libre', serif"};
      font-size: ${data.element_styles?.h1?.fontSize || '28px'};
      line-height: ${bodyLineHeight};
      margin: 20px 0;
      font-weight: ${data.element_styles?.h1?.fontWeight || '700'};
    `,
    h2: `
      color: ${data.element_styles?.h2?.color || '#0e2f5e'};
      font-family: ${data.element_styles?.h2?.fontFamily || "'rashrash', sans-serif"};
      font-size: ${data.element_styles?.h2?.fontSize || '24px'};
      line-height: ${bodyLineHeight};
      margin: 18px 0;
      font-weight: ${data.element_styles?.h2?.fontWeight || '700'};
    `,
    h3: `
      color: ${data.element_styles?.h3?.color || '#6b46c2'};
      font-family: ${bodyFontFamily};
      font-size: ${data.element_styles?.h3?.fontSize || '20px'};
      line-height: ${bodyLineHeight};
      margin: 16px 0;
      font-weight: ${data.element_styles?.h3?.fontWeight || '600'};
    `,
    p: `
      margin: 16px 0;
      color: ${bodyColor};
      font-family: ${bodyFontFamily};
      font-size: ${bodyFontSize};
      line-height: ${bodyLineHeight};
    `,
    ul: `
      margin: 16px 0;
      padding-right: 20px;
      padding-left: 0;
      font-family: ${bodyFontFamily};
      font-size: ${bodyFontSize};
      line-height: ${bodyLineHeight};
      color: ${bodyColor};
    `,
    ol: `
      margin: 16px 0;
      padding-right: 20px;
      padding-left: 0;
      font-family: ${bodyFontFamily};
      font-size: ${bodyFontSize};
      line-height: ${bodyLineHeight};
      color: ${bodyColor};
    `,
    li: `
      margin: 8px 0;
      font-family: ${bodyFontFamily};
      font-size: ${bodyFontSize};
      line-height: ${bodyLineHeight};
      color: ${bodyColor};
    `,
    strong: `
      font-weight: 700;
      font-family: ${bodyFontFamily};
      font-size: ${bodyFontSize};
      line-height: ${bodyLineHeight};
      color: ${bodyColor};
    `,
    em: `
      font-style: italic;
      font-family: ${bodyFontFamily};
      font-size: ${bodyFontSize};
      line-height: ${bodyLineHeight};
      color: ${bodyColor};
    `,
    code: `
      font-family: 'Courier New', monospace;
      font-size: ${bodyFontSize};
      line-height: ${bodyLineHeight};
      color: ${bodyColor};
      background-color: #f5f5f5;
      padding: 2px 4px;
      border-radius: 4px;
    `,
    del: `
      text-decoration: line-through;
      font-family: ${bodyFontFamily};
      font-size: ${bodyFontSize};
      line-height: ${bodyLineHeight};
      color: ${bodyColor};
    `,
    logo: `
      width: 150px;
      height: auto;
      margin: 20px auto;
      display: block;
    `,
    centerDiv: `
      text-align: center;
      margin: 40px auto;
    `
  };
};

const generateHtml = (content: string, styles: ReturnType<typeof getStyles>, data?: TemplateData, index: number = 0) => {
  // Convert markdown to HTML
  const rawHtml = marked(content) as string;

  // Apply inline styles
  const styledHtml = rawHtml
    .replace(/<h1/g, `<h1 style="${styles.h1}"`)
    .replace(/<h2/g, `<h2 style="${styles.h2}"`)
    .replace(/<h3/g, `<h3 style="${styles.h3}"`)
    .replace(/<p/g, `<p style="${styles.p}"`)
    .replace(/<ul/g, `<ul style="${styles.ul}"`)
    .replace(/<ol/g, `<ol style="${styles.ol}"`)
    .replace(/<li/g, `<li style="${styles.li}"`)
    .replace(/<strong/g, `<strong style="${styles.strong}"`)
    .replace(/<em/g, `<em style="${styles.em}"`)
    .replace(/<code/g, `<code style="${styles.code}"`)
    .replace(/<del/g, `<del style="${styles.del}"`);

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Document</title>
<link href="https://fonts.googleapis.com/css2?family=Rubik:ital,wght@0,300..800;1,300..800&family=David+Libre:wght@400;500;700&family=Assistant:ital,wght@0,300..800;1,300..800&display=swap" rel="stylesheet">
<style>
@font-face {
  font-family: 'rashrash';
  src: url('https://fdecrxcxrshebgrmbywz.supabase.co/storage/v1/object/public/storage/fonts/rashrash.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

body {
  ${styles.body}
}
</style>
</head>
<body>
${data?.logo ? `<div style="${styles.centerDiv}"><img src="https://fdecrxcxrshebgrmbywz.supabase.co/storage/v1/object/public/storage/logos/${data.logo}" style="${styles.logo}" alt="Logo" /></div>` : ''}
${styledHtml}
</body>
</html>`;

  return html;
};

export async function POST(req: Request) {
  try {
    const { markdowns, mdContents, template_id, templateId, template } = await req.json();
    
    // Normalize input to array
    const markdownContent: string[] = Array.isArray(markdowns || mdContents) 
      ? markdowns || mdContents 
      : [markdowns || mdContents];

    if (!markdownContent?.length) {
      throw new Error('No markdown content provided');
    }

    // Get template data if template_id is provided
    let templateData: TemplateData | undefined;
    // Try all possible template ID sources
    const effectiveTemplateId = template_id || templateId || template?.id || template?.template_gsheets_id;
    
    if (effectiveTemplateId) {
      console.log('Fetching template with gsheets_id:', effectiveTemplateId);
      const { data: templates, error } = await supabase
        .from('templates')
        .select('*, custom_fonts(*), element_styles')
        .eq('template_gsheets_id', effectiveTemplateId);

      if (error) {
        console.error('Error fetching template:', error);
        throw new Error(`Failed to fetch template: ${error.message}`);
      }

      const template = templates?.[0];
      if (template) {
        console.log('Found template:', template);
        // Get logo if exists
        const { data: logoData } = await supabase
          .from('logos')
          .select('file_path')
          .eq('template_id', template.id)
          .single();

        templateData = {
          colors: {
            h1Color: template.color1 || '#333',
            h2Color: template.color3 || '#444',
            h3Color: template.color2 || '#555',
            bodyFontSize: template.element_styles?.body?.fontSize || '16px'
          },
          element_styles: template.element_styles,
          logo: logoData ? {
            url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/storage/${logoData.file_path}`,
            showOnAllPages: template.show_logo_on_all_pages || false
          } : undefined,
          opening_page_content: template.opening_page_content,
          closing_page_content: template.closing_page_content,
          custom_fonts: template.custom_fonts
        };
        console.log('Processed template data:', templateData);
      }
    }

    if (!templateData) {
      return NextResponse.json({ error: "Template data not found" }, { status: 404 });
    }

    const styles = getStyles(templateData);
    console.log('Generated styles:', styles);

    // Prepare final content array
    const finalContent: string[] = [];
    
    // Add opening page if exists and we have multiple pages
    if (templateData?.opening_page_content && markdownContent.length > 1) {
      finalContent.push(templateData.opening_page_content);
    }
    
    // Add main content
    finalContent.push(...markdownContent);
    
    // Add closing page if exists and we have multiple pages
    if (templateData?.closing_page_content && markdownContent.length > 1) {
      finalContent.push(templateData.closing_page_content);
    }

    // Convert to HTML
    const htmlContents = finalContent.map((content, index) => 
      generateHtml(content, styles, templateData, index)
    );

    // Process HTML files and generate PDFs
    const results = await Promise.all(
      htmlContents.map(async (html: string) => {
        try {
          const { htmlFilename, pdfFilename } = await processHtmlContent(html);
          return { htmlFilename, pdfFilename };
        } catch (error) {
          console.error('Error processing HTML:', error);
          throw error;
        }
      })
    );

    return NextResponse.json({ 
      files: results,
      htmls: htmlContents 
    });

  } catch (error) {
    console.error('Error in API route:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}