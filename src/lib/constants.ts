export const FONT_FAMILIES = {
  'Rubik': "'Rubik', sans-serif",
  'Heebo': "'Heebo', sans-serif",
  'Assistant': "'Assistant', sans-serif",
  'Varela Round': "'Varela Round', sans-serif",
  'Secular One': "'Secular One', sans-serif",
  'Suez One': "'Suez One', serif",
  'Frank Ruhl Libre': "'Frank Ruhl Libre', serif"
} as const;

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
  margin: 'margin',
  padding: 'padding'
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

export const generateHtmlTemplate = (html: string, css: string, googleFontsUrl: string) => `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  ${googleFontsUrl ? `<link href="${googleFontsUrl}" rel="stylesheet" />` : ''}
  <style>
    ${DEFAULT_BODY_STYLES}
    ${css}
  </style>
</head>
<body>
  ${html}
</body>
</html>`;

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