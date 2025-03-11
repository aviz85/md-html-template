import { marked } from 'marked';
import { createClient } from '@supabase/supabase-js';
import type { Template } from '../types/index';
import { ElementStyle } from "@/types"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

export const FONT_FAMILIES = {
  'Rubik': "'Rubik', sans-serif",
  'Heebo': "'Heebo', sans-serif",
  'Assistant': "'Assistant', sans-serif",
  'Varela Round': "'Varela Round', sans-serif",
  'Secular One': "'Secular One', sans-serif",
  'Suez One': "'Suez One', serif",
  'Frank Ruhl Libre': "'Frank Ruhl Libre', serif",
  'David Libre': "'David Libre', serif"
} as const;

// Function to load custom fonts from Supabase
export const loadCustomFonts = async (templateId?: string) => {
  let query = supabase.from('custom_fonts').select('*');
  
  if (templateId) {
    query = query.eq('template_id', templateId);
  }

  const { data: fonts, error } = await query;

  if (error) {
    console.error('Error loading custom fonts:', error);
    return {};
  }

  const customFonts: Record<string, string> = {};
  fonts?.forEach(font => {
    customFonts[font.name] = `'${font.font_family}', sans-serif`;
  });

  return customFonts;
};

// Function to generate @font-face rules for custom fonts
export function generateCustomFontFaces(fonts: Array<{ 
  name: string, 
  file_path: string, 
  font_family: string, 
  format: string,
  weight_range?: number[],
  has_italic?: boolean,
  font_display?: string 
}>) {
  return fonts.map(font => {
    const format = getFormatString(font.format);
    const fullUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/storage/${font.file_path}`;
    const weights = font.weight_range || [400];
    
    return weights.map(weight => {
      const normalStyle = `
@font-face {
  font-family: '${font.name}';
  src: url('${fullUrl}') format('${format}');
  font-weight: ${weight};
  font-style: normal;
  font-display: ${font.font_display || 'swap'};
}`;

      const italicStyle = font.has_italic ? `
@font-face {
  font-family: '${font.name}';
  src: url('${fullUrl}') format('${format}');
  font-weight: ${weight};
  font-style: italic;
  font-display: ${font.font_display || 'swap'};
}` : '';

      return `${normalStyle}${italicStyle}`;
    }).join('\n');
  }).join('\n');
}

// Helper function to get the format string for @font-face
function getFormatString(format: string): string {
  switch (format.toLowerCase()) {
    case 'woff2': return 'woff2';
    case 'woff': return 'woff';
    case 'ttf': return 'truetype';
    case 'otf': return 'opentype';
    default: return format;
  }
}

// Convert camelCase to kebab-case
export const toKebabCase = (str: string): string => 
  str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

// Convert kebab-case to camelCase
export const toCamelCase = (str: string): string =>
  str.replace(/-([a-z])/g, g => g[1].toUpperCase());

// CSS property mapping
export const CSS_PROPERTIES = {
  color: 'color',
  backgroundColor: 'background-color',
  fontSize: 'font-size',
  fontFamily: 'font-family',
  textAlign: 'text-align',
  margin: 'margin',
  marginTop: 'margin-top',
  marginBottom: 'margin-bottom',
  padding: 'padding',
  fontWeight: 'font-weight',
  lineHeight: 'line-height',
  direction: 'direction'
} as const;

// Default body styles
export const DEFAULT_BODY_STYLES = `
body {
  font-family: 'Assistant', sans-serif;
  line-height: 1.5;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
}

h1, h2, h3, h4, h5, h6 {
  margin-top: 2em;
  margin-bottom: 1em;
  line-height: 1.2;
  font-weight: 600;
}

table {
  border-collapse: collapse;
  width: 100%;
  margin: 1rem 0;
  direction: rtl;
  text-align: right;
}

th, td {
  border: 1px solid #e5e7eb;
  padding: 0.75rem;
  text-align: right;
}

th {
  background-color: #f9fafb;
  font-weight: 600;
}

tr:nth-child(even) {
  background-color: #f8f8f8;
}

tr:hover {
  background-color: #f3f4f6;
}

* {
  box-sizing: border-box;
}
`;

export const generateHtmlTemplate = (
  content: string,
  elementStyles: Record<string, ElementStyle>,
  googleFontsUrl: string,
  customFontFaces: string
) => {
  // Generate CSS directly from elementStyles
  const generateCSS = (styles: Record<string, ElementStyle>) => {
    let css = ''
    
    // Add styles for each element
    Object.entries(styles).forEach(([element, styles]) => {
      if (Object.keys(styles).length === 0) return

      // Convert element name to CSS selector
      const selector = element === 'specialParagraph' ? '.special-paragraph' :
                      element === 'header' ? '.header' :
                      element === 'footer' ? '.footer' :
                      element

      css += `${selector} {\n`
      
      // Add standard properties first
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
  };

  const generatedCss = generateCSS(elementStyles);

  // Extract font-family from css to override default body font if needed
  const bodyFontMatch = generatedCss.match(/body\s*{[^}]*font-family:\s*([^;}]+)/);
  const bodyFont = bodyFontMatch ? bodyFontMatch[1].trim() : "'Assistant', sans-serif";
  
  // Get Supabase storage URL
  const supabaseStorageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? 
    new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/storage`).origin : null;
  
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${googleFontsUrl ? `
  <!-- Google Fonts preconnect -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${googleFontsUrl}" rel="stylesheet" type="text/css">` : ''}
  ${supabaseStorageUrl ? `
  <!-- Supabase Storage preconnect -->
  <link rel="preconnect" href="${supabaseStorageUrl}" crossorigin>` : ''}
  <style type="text/css">
    html * {
      font-family: ${bodyFont};
    }

    body {
      margin: 0;
      padding: 2rem;
      font-family: ${bodyFont};
      line-height: 1.5;
      max-width: 800px;
      margin-left: auto;
      margin-right: auto;
    }

    * {
      box-sizing: border-box;
    }

    ${customFontFaces}
    ${generatedCss}
  </style>
</head>
<body>
  ${content}
</body>
</html>`
}

export const extractUsedFonts = (css: string): string[] => {
  const usedFonts = new Set<string>();
  
  // Extract all font-family declarations
  const fontFamilyRegex = /font-family:\s*([^;}]+)/g;
  let match;
  
  while ((match = fontFamilyRegex.exec(css)) !== null) {
    const fontValue = match[1].trim();
    // Remove quotes and get the first font in the stack
    const primaryFont = fontValue.replace(/["']/g, '').split(',')[0].trim();
    
    // Check if this font is in our FONT_FAMILIES
    Object.entries(FONT_FAMILIES).forEach(([fontName]) => {
      if (primaryFont.toLowerCase() === fontName.toLowerCase()) {
        usedFonts.add(fontName);
      }
    });
  }
  
  // Always include Assistant as it's used in body by default
  usedFonts.add('Assistant');
  
  console.log('Found fonts:', Array.from(usedFonts));
  return Array.from(usedFonts);
};

export const generateGoogleFontsUrl = (fonts: string[]): string => {
  if (fonts.length === 0) return '';
  
  const fontFamilies = fonts.map(font => {
    // Add weights and italics for each font
    switch (font) {
      case 'Rubik':
      case 'Heebo':
      case 'Assistant':
        return `${font}:ital,wght@0,300..800;1,300..800`;
      case 'Varela Round':
      case 'Secular One':
      case 'Suez One':
        return font;
      case 'Frank Ruhl Libre':
        return `${font}:wght@300..900`;
      case 'David Libre':
        return `${font}:wght@400;500;700`;
      default:
        return `${font}:ital,wght@0,300..800;1,300..800`;
    }
  });

  return `https://fonts.googleapis.com/css2?${fontFamilies.map(f => `family=${f.replace(' ', '+')}`).join('&')}&display=swap`;
};

export function configureMarked() {
  marked.setOptions({
    breaks: true,
    gfm: true,
    pedantic: false
  });
}

export async function convertMarkdownToHtml(content: string, headerContent?: string, footerContent?: string, customContents?: Array<{ name: string, content: string }>) {
  if (!content) {
    throw new Error('Content is required')
  }

  // Configure marked once
  configureMarked();

  let processedContent = content;
  
  // Replace custom content placeholders
  if (customContents) {
    customContents.forEach(({ name, content }) => {
      const cleanName = name.replace('custom_', '');
      const upperPlaceholder = `[${cleanName.toUpperCase()}]`;
      const lowerPlaceholder = `[${cleanName.toLowerCase()}]`;
      processedContent = processedContent.replace(upperPlaceholder, content).replace(lowerPlaceholder, content);
    });
  }

  // Add custom image renderer
  const renderer = new marked.Renderer();

  // Define allowed image style properties
  const ALLOWED_IMG_PROPS = {
    'width': true,
    'height': true,
    'max-width': true,
    'max-height': true,
    'min-width': true,
    'min-height': true,
    'object-fit': true,
    'object-position': true,
    'opacity': true,
    'border-radius': true,
    'margin': true,
    'display': true,
  } as const;

  renderer.image = (href: string, title: string | null, text: string) => {
    // Extract all style parameters (e.g. "[height=200px]", "[width=300px]", "[object-fit=cover]")
    const styleMatches = text.match(/\[([a-zA-Z-]+)=([^\]]+)\]/g) || [];
    
    // Remove all style parameters from text to get clean alt
    let alt = text;
    const styles: string[] = [];

    styleMatches.forEach(match => {
      // Remove the style parameter from alt text
      alt = alt.replace(match, '');
      
      // Extract property and value
      const [_, prop, value] = match.match(/\[([a-zA-Z-]+)=([^\]]+)\]/) || [];
      if (prop && value && prop in ALLOWED_IMG_PROPS) {
        // Sanitize value to prevent XSS
        const sanitizedValue = value.replace(/[<>"]/g, '');
        // Add !important to override responsive styles
        styles.push(`${prop}: ${sanitizedValue} !important`);
      }
    });

    // Clean up alt text (trim and handle empty case)
    alt = alt.trim();
    
    // Build style attribute and data attribute to pass original styles
    const style = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';
    const dataStyles = styles.length > 0 ? ` data-original-styles="${styles.join('; ')}"` : '';
    
    return `<img src="${href}"${alt ? ` alt="${alt}"` : ''}${title ? ` title="${title}"` : ''}${style}${dataStyles}>`;
  };

  marked.setOptions({ renderer });

  // Parse markdown content first
  const contentHtml = await marked.parse(processedContent);
  
  // Add header and footer if provided
  const footerHtml = footerContent ? `\n<div class="footer">${await marked.parse(footerContent)}</div>` : '';
  
  // Return combined HTML with raw header content
  return `${headerContent || ''}${contentHtml}${footerHtml}`;
} 