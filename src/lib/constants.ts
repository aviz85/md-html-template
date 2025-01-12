import { marked } from 'marked';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const FONT_FAMILIES = {
  'Rubik': "'Rubik', sans-serif",
  'Heebo': "'Heebo', sans-serif",
  'Assistant': "'Assistant', sans-serif",
  'Varela Round': "'Varela Round', sans-serif",
  'Secular One': "'Secular One', sans-serif",
  'Suez One': "'Suez One', serif",
  'Frank Ruhl Libre': "'Frank Ruhl Libre', serif"
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
export function generateCustomFontFaces(fonts: Array<{ name: string, file_path: string, font_family: string, format: string }>) {
  return fonts.map(font => {
    const format = font.format === 'ttf' ? 'truetype' : font.format;
    const fullUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/fonts/${font.file_path}`;
    return `
@font-face {
  font-family: '${font.name}';
  src: url('${fullUrl}') format('${format}');
  font-weight: normal;
  font-style: normal;
}
`
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
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${googleFontsUrl ? `<link href="${googleFontsUrl}" rel="stylesheet">` : ''}
  <style>
    ${DEFAULT_BODY_STYLES}
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
  
  // Always include Assistant as it's used in body
  usedFonts.add('Assistant');
  
  Object.entries(FONT_FAMILIES).forEach(([fontName, fontValue]) => {
    if (css.includes(fontValue)) {
      usedFonts.add(fontName);
    }
  });

  return Array.from(usedFonts);
};

export const generateGoogleFontsUrl = (fonts: string[]): string => {
  if (fonts.length === 0) return '';
  
  const fontFamilies = fonts.map(font => {
    // Add weights for each font
    switch (font) {
      case 'Rubik':
      case 'Heebo':
      case 'Assistant':
        return `${font}:wght@400;500;700`;
      case 'Varela Round':
      case 'Secular One':
      case 'Suez One':
        return font;
      case 'Frank Ruhl Libre':
        return `${font}:wght@400;700`;
      default:
        return font;
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
      const placeholder = `[${name}]`;
      processedContent = processedContent.replace(placeholder, content);
    });
  }

  const headerHtml = headerContent ? `<div class="header">${await marked.parse(headerContent)}</div>\n` : '';
  const contentHtml = await marked.parse(processedContent);
  const footerHtml = footerContent ? `\n<div class="footer">${await marked.parse(footerContent)}</div>` : '';
  
  return `${headerHtml}${contentHtml}${footerHtml}`;
} 