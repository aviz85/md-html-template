import { marked } from 'marked';
import { createClient } from '@supabase/supabase-js';

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
export const loadCustomFonts = async () => {
  const { data: fonts, error } = await supabase
    .from('custom_fonts')
    .select('*');

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
    const format = font.format === 'ttf' ? 'truetype' : font.format;
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
  switch (format) {
    case 'woff2': return 'woff2';
    case 'woff': return 'woff';
    case 'ttf': return 'truetype';
    case 'otf': return 'opentype';
    default: return 'woff2';
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
  margin: 'margin',
  padding: 'padding',
  fontFamily: 'font-family',
  textAlign: 'text-align'
} as const;

// Default body styles
export const DEFAULT_BODY_STYLES = `
body {
  margin: 0;
  padding: 2rem;
  font-family: 'Assistant', sans-serif;
  line-height: 1.5;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
}

* {
  box-sizing: border-box;
}
`;

export const generateHtmlTemplate = (
  content: string,
  css: string,
  googleFontsUrl: string,
  customFontFaces: string
) => {
  // Extract font-family from css to override default body font if needed
  const bodyFontMatch = css.match(/body\s*{[^}]*font-family:\s*([^;}]+)/);
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
    ${css}
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

export async function convertMarkdownToHtml(content: string, headerContent?: string, footerContent?: string, customContents?: Array<{ name: string, content: string }>) {
  if (!content) {
    throw new Error('Content is required')
  }

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

  // Configure marked for proper line breaks
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerid: false,
    smartLists: true,
    smartypants: true,
  });

  // Parse markdown content first
  const contentHtml = await marked.parse(processedContent);
  
  // Add header and footer if provided
  const footerHtml = footerContent ? `\n<div class="footer">${await marked.parse(footerContent)}</div>` : '';
  
  // Return combined HTML with raw header content
  return `${headerContent || ''}${contentHtml}${footerHtml}`;
} 