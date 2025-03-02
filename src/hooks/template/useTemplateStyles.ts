import { ElementStyle, ValidationResult } from "@/types"
import { CSS_PROPERTIES } from "@/lib/constants"

export function useTemplateStyles() {
  const validateStyles = (styles: Record<string, ElementStyle>): ValidationResult => {
    // Check if styles exists
    if (!styles) {
      return { isValid: false, error: "Styles are required" }
    }

    // Check if all required elements have styles
    const requiredElements = ["body", "h1", "p"]
    
    for (const element of requiredElements) {
      if (!styles[element]) {
        return { isValid: false, error: `Style for "${element}" is required` }
      }
    }

    return { isValid: true }
  }

  const isValidStyleProperty = (prop: string): prop is keyof ElementStyle => {
    return Object.keys(CSS_PROPERTIES).includes(prop)
  }

  const parseCSS = (css: string) => {
    const styles: Record<string, ElementStyle> = {}
    const regex = /([a-zA-Z0-9_\-.#]+)\s*{([^}]*)}/g
    let match

    while ((match = regex.exec(css)) !== null) {
      const selector = match[1].trim()
      const styleStr = match[2].trim()
      const style: ElementStyle = {}

      const styleProps = styleStr.split(';')
      for (const prop of styleProps) {
        const [key, value] = prop.split(':')
        if (key && value) {
          const camelCaseKey = key.trim().replace(/-([a-z])/g, (_, group) => group.toUpperCase())
          if (isValidStyleProperty(camelCaseKey)) {
            (style as any)[camelCaseKey] = value.trim()
          }
        }
      }

      styles[selector] = style
    }

    return styles
  }

  const generateCSS = (styles: Record<string, ElementStyle>) => {
    let css = ''

    for (const [element, style] of Object.entries(styles)) {
      if (!style || Object.keys(style as object).length === 0) continue

      css += `${element} {\n`
      
      for (const [property, value] of Object.entries(style as Record<string, string | undefined>)) {
        if (value !== undefined) {
          // Convert camelCase to kebab-case
          const kebabProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase()
          css += `  ${kebabProperty}: ${value};\n`
        }
      }
      
      css += '}\n\n'
    }

    return css
  }

  return {
    validateStyles,
    isValidStyleProperty,
    parseCSS,
    generateCSS
  }
} 