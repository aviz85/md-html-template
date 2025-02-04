import { type ImgHTMLAttributes } from 'react';

export const ImageRenderer = ({ node, ...props }: { node?: any } & ImgHTMLAttributes<HTMLImageElement>) => {
  // Get original styles from data attribute - React converts data-original-styles to dataOriginalStyles
  const originalStyles = node?.properties?.dataOriginalStyles;
  
  console.log('ImageRenderer: Initial props and data:', {
    originalStyles,
    propsStyle: props.style,
    nodeProperties: node?.properties,
    allProps: props
  });
  
  if (originalStyles) {
    // Parse the original styles into an object
    const parsedStyles = Object.fromEntries(
      originalStyles.split(';')
        .map((s: string) => {
          const [key, value] = s.split(':').map(p => p.trim());
          // Convert kebab-case to camelCase for React
          const camelKey = key.replace(/-([a-z])/g, g => g[1].toUpperCase());
          const cleanValue = value.replace(' !important', '');
          console.log('ImageRenderer: Parsing style:', { key, value, camelKey, cleanValue });
          return [camelKey, cleanValue];
        })
    );
    
    console.log('ImageRenderer: Parsed styles:', parsedStyles);
    
    // Override default styles with our parsed styles, ensuring they take precedence
    const finalStyles = {
      maxWidth: '100%',
      height: 'auto',
      ...props.style,
      ...parsedStyles
    };
    
    console.log('ImageRenderer: Final styles with original styles:', finalStyles);
    
    return <img {...props} style={finalStyles} />;
  }
  
  // Default to responsive behavior only if no original styles
  const defaultStyles = { maxWidth: '100%', height: 'auto', ...props.style };
  console.log('ImageRenderer: Using default styles (no original styles):', defaultStyles);
  return <img {...props} style={defaultStyles} />;
}; 