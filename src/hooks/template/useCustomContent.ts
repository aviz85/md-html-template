import { useState } from "react"
import { Template } from "@/types"

export interface CustomContent {
  name: string
  content: string
}

export function useCustomContent(initialContent?: Template["custom_contents"]) {
  const [customContents, setCustomContents] = useState<CustomContent[]>(initialContent || [])
  
  const handleAddCustomContent = () => {
    setCustomContents(prev => [
      ...prev,
      {
        name: `Custom Section ${prev.length + 1}`,
        content: ""
      }
    ])
  }
  
  const handleCustomContentChange = (index: number, field: 'name' | 'content', value: string) => {
    setCustomContents(prev => {
      const newContents = [...prev]
      if (newContents[index]) {
        newContents[index] = {
          ...newContents[index],
          [field]: value
        }
      }
      return newContents
    })
  }
  
  const handleRemoveCustomContent = (index: number) => {
    setCustomContents(prev => prev.filter((_, i) => i !== index))
  }
  
  return {
    customContents,
    setCustomContents,
    handleAddCustomContent,
    handleCustomContentChange,
    handleRemoveCustomContent
  }
} 