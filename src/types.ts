export type LogoPosition = 'top-right' | 'top-center' | 'top-left' | 'bottom-right' | 'bottom-center' | 'bottom-left';

export interface ElementStyle {
  // Base styles
  color?: string;
  backgroundColor?: string;
  fontSize?: string;
  fontWeight?: string;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
  lineHeight?: string;
  margin?: string;
  padding?: string;
  border?: string;
  borderRadius?: string;
  boxShadow?: string;
  opacity?: string;
  transform?: string;
  transition?: string;
  letterSpacing?: string;
  wordSpacing?: string;
  textDecoration?: string;
  textTransform?: string;
  direction?: 'rtl' | 'ltr';
  customCss?: string;
  
  // Logo styles
  logoWidth?: string;
  logoHeight?: string;
  logoPosition?: LogoPosition;
  logoMargin?: string;
  showLogo?: boolean;
  showLogoOnAllPages?: boolean;
} 

export interface CustomFont {
  id: string;
  template_id: string;
  name: string;
  file_path: string;
  font_family: string;
  format: string;
  weight_range: number[];
  has_italic: boolean;
  font_display: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
  created_at: string;
  publicUrl?: string;
}

export interface FontUploadRequest {
  templateId: string;
  fontName: string;
  fileExt: string;
  fileData: string;
  weightRange?: number[];
  hasItalic?: boolean;
  fontDisplay?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
} 