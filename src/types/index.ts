export interface ElementStyle {
  color?: string
  backgroundColor?: string
  fontSize?: string
  margin?: string
  padding?: string
  fontFamily?: string
  textAlign?: 'right' | 'left' | 'center' | 'justify'
  customCss?: string
  logoWidth?: string
  logoHeight?: string
  logoPosition?: 'top-right' | 'top-left' | 'top-center' | 'center-right' | 'center-left' | 'center' | 'bottom-right' | 'bottom-left' | 'bottom-center'
  logoMargin?: string
  showLogo?: boolean
}

export interface Template {
  elementStyles: {
    body?: Record<string, string>;
    h1?: Record<string, string>;
    h2?: Record<string, string>;
    h3?: Record<string, string>;
    h4?: Record<string, string>;
    h5?: Record<string, string>;
    h6?: Record<string, string>;
    list?: Record<string, string>;
    p?: Record<string, string>;
    specialParagraph?: Record<string, string>;
    main?: Record<string, string>;
    prose?: Record<string, string>;
    header?: {
      showLogo?: boolean;
      logoWidth?: string;
      logoHeight?: string;
      logoMargin?: string;
      logoPosition?: string;
    };
    footer?: Record<string, string>;
  };
} 