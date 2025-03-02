import { Template, ElementType } from "./index"

export interface TemplateEditorProps {
  templateId?: string
  onSave?: () => void
}

export interface ResizableSplitterProps {
  onResize: (width: number) => void
}

export interface StyleChangeParams {
  elementType: string
  style: any
}

export interface MediaFile {
  name: string
  url: string
  type: string
  created_at: string
}

export interface TemplateContextType {
  template: Template | null
  setTemplate: React.Dispatch<React.SetStateAction<Template | null>>
  elementStyles: Template["elementStyles"]
  setElementStyles: React.Dispatch<React.SetStateAction<Template["elementStyles"]>>
  activeElement: ElementType
  setActiveElement: React.Dispatch<React.SetStateAction<ElementType>>
  previewHtml: string
  setPreviewHtml: React.Dispatch<React.SetStateAction<string>>
  isLoading: boolean
  saveTemplate: () => Promise<void>
  generatePreview: () => Promise<void>
} 