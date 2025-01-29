import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"

interface ColorPickerProps {
  id: string
  label: string
  value: string | undefined
  onChange: (value: string | undefined) => void
}

export function ColorPicker({ id, label, value, onChange }: ColorPickerProps) {
  const [hexValue, setHexValue] = useState(value || "#ffffff")

  useEffect(() => {
    setHexValue(value || "#ffffff")
  }, [value])

  const handleHexChange = (newValue: string) => {
    // Remove # if exists
    newValue = newValue.replace("#", "")
    
    // Add # if missing
    if (!newValue.startsWith("#")) {
      newValue = "#" + newValue
    }

    // Validate hex color
    if (/^#[0-9A-Fa-f]{6}$/.test(newValue)) {
      onChange(newValue)
    } else {
      setHexValue(value || "#ffffff")
    }
  }

  const handleHexInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setHexValue(newValue)
    
    // Only update parent if it's a valid hex color
    if (/^#[0-9A-Fa-f]{6}$/.test(newValue)) {
      onChange(newValue)
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedText = e.clipboardData.getData('text')
    let newValue = pastedText.trim()
    
    // Remove # if exists
    newValue = newValue.replace("#", "")
    
    // Add # if missing
    if (!newValue.startsWith("#")) {
      newValue = "#" + newValue
    }

    // Validate and update if it's a valid hex color
    if (/^#[0-9A-Fa-f]{6}$/.test(newValue)) {
      setHexValue(newValue)
      onChange(newValue)
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-1">
        <Input
          id={id}
          type="color"
          value={value || "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
          className="w-[100px]"
          dir="ltr"
        />
        <Input
          value={hexValue}
          onChange={handleHexInput}
          onBlur={() => handleHexChange(hexValue)}
          onPaste={handlePaste}
          className="w-[100px] font-mono uppercase"
          placeholder="#FFFFFF"
          maxLength={7}
          dir="ltr"
        />
        <Button
          variant="outline"
          size="icon"
          onClick={() => onChange(undefined)}
          className="h-10 w-10"
          title="ללא צבע"
        >
          <span className="text-lg">⊘</span>
        </Button>
      </div>
    </div>
  )
} 