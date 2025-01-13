export interface ElementStyle {
  // Base styles
  color?: string;
  backgroundColor?: string;
  fontSize?: string;
  fontWeight?: string;
  fontFamily?: string;
  textAlign?: 'right' | 'left' | 'center' | 'justify';
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
  logoPosition?: 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  logoMargin?: string;
  showLogo?: boolean;
  showLogoOnAllPages?: boolean;
} 