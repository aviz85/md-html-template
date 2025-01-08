"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChangeEvent } from "react"

interface ElementStyle {
  color?: string
  backgroundColor?: string
  fontSize?: string
  margin?: string
  padding?: string
}

interface StyleEditorProps {
  style: ElementStyle
  onChange: (style: ElementStyle) => void
}

export function StyleEditor({ style, onChange }: StyleEditorProps) {
  const handleChange = (key: keyof ElementStyle) => (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...style, [key]: e.target.value })
  }

  return (
    <div className="grid gap-4 p-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="color">Color</Label>
          <Input
            id="color"
            type="color"
            value={style.color || "#000000"}
            onChange={handleChange("color")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="backgroundColor">Background</Label>
          <Input
            id="backgroundColor"
            type="color"
            value={style.backgroundColor || "#ffffff"}
            onChange={handleChange("backgroundColor")}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fontSize">Font Size</Label>
          <Input
            id="fontSize"
            type="text"
            value={style.fontSize || ""}
            placeholder="16px"
            onChange={handleChange("fontSize")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="margin">Margin</Label>
          <Input
            id="margin"
            type="text"
            value={style.margin || ""}
            placeholder="1rem"
            onChange={handleChange("margin")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="padding">Padding</Label>
          <Input
            id="padding"
            type="text"
            value={style.padding || ""}
            placeholder="1rem"
            onChange={handleChange("padding")}
          />
        </div>
      </div>
    </div>
  )
} 