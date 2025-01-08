"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ChangeEvent } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const HEBREW_FONTS = [
  { name: "Default", value: "inherit" },
  { name: "Rubik", value: "'Rubik', sans-serif" },
  { name: "Heebo", value: "'Heebo', sans-serif" },
  { name: "Assistant", value: "'Assistant', sans-serif" },
  { name: "Varela Round", value: "'Varela Round', sans-serif" },
  { name: "Secular One", value: "'Secular One', sans-serif" },
  { name: "Suez One", value: "'Suez One', serif" },
  { name: "Frank Ruhl Libre", value: "'Frank Ruhl Libre', serif" },
]

interface ElementStyle {
  color?: string
  backgroundColor?: string
  fontSize?: string
  margin?: string
  padding?: string
  fontFamily?: string
}

interface StyleEditorProps {
  style: ElementStyle
  onChange: (style: ElementStyle) => void
  templateColors?: {
    color1: string
    color2: string
    color3: string
    color4: string
  }
}

export function StyleEditor({ style, onChange, templateColors }: StyleEditorProps) {
  const handleChange = (key: keyof ElementStyle) => (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim()
    onChange({ 
      ...style, 
      [key]: value || undefined  // Convert empty string to undefined
    })
  }

  const ColorPicker = ({ id, label, value, onChange }: { 
    id: string
    label: string
    value: string
    onChange: (value: string) => void 
  }) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="w-[100px]"
        />
        <Input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="font-mono"
        />
        {id === "backgroundColor" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange("")}
            className="whitespace-nowrap"
          >
            None
          </Button>
        )}
      </div>
      {templateColors && (
        <div className="flex gap-2 mt-2">
          {Object.entries(templateColors).map(([key, color]) => (
            <Button
              key={key}
              variant="outline"
              size="sm"
              className="w-8 h-8 p-0"
              style={{ backgroundColor: color }}
              onClick={() => onChange(color)}
            />
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="grid gap-4 p-4">
      <div className="grid grid-cols-2 gap-4">
        <ColorPicker
          id="color"
          label="Color"
          value={style.color || ""}
          onChange={(value) => onChange({ ...style, color: value })}
        />
        <ColorPicker
          id="backgroundColor"
          label="Background"
          value={style.backgroundColor || ""}
          onChange={(value) => onChange({ ...style, backgroundColor: value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Font Family</Label>
          <Select
            value={style.fontFamily || "inherit"}
            onValueChange={(value) => onChange({ ...style, fontFamily: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HEBREW_FONTS.map((font) => (
                <SelectItem 
                  key={font.value} 
                  value={font.value}
                  style={{ fontFamily: font.value }}
                >
                  {font.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
      </div>
      <div className="grid grid-cols-2 gap-4">
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