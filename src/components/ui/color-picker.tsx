import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

interface ColorPickerProps {
  id: string
  label: string
  value: string | undefined
  onChange: (value: string | undefined) => void
}

export function ColorPicker({ id, label, value, onChange }: ColorPickerProps) {
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