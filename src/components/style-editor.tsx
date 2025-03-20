"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ChangeEvent, useState, useEffect } from "react"
import { TRANSLATIONS } from "@/lib/translations"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FONT_FAMILIES, CSS_PROPERTIES, loadCustomFonts } from "@/lib/constants"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase-client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Upload } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { ElementStyle } from "@/types"
import { ColorPicker } from "@/components/ui/color-picker"

const HEBREW_FONTS = [
  { name: "ברירת מחדל", value: "inherit" },
  { name: "דויד", value: "'David Libre', serif" },
  { name: "רוביק", value: "'Rubik', sans-serif" },
  { name: "הבו", value: "'Heebo', sans-serif" },
  { name: "אסיסטנט", value: "'Assistant', sans-serif" },
  { name: "ורלה עגול", value: "'Varela Round', sans-serif" },
  { name: "חילוני", value: "'Secular One', sans-serif" },
  { name: "סואץ", value: "'Suez One', serif" },
  { name: "פרנק רול", value: "'Frank Ruhl Libre', serif" },
]

interface StyleEditorProps {
  style: ElementStyle
  onChange: (style: ElementStyle) => void
  templateColors?: {
    color1: string
    color2: string
    color3: string
    color4: string
  }
  customFonts?: Array<{
    name: string
    font_family: string
  }>
}

export function StyleEditor({ style = {}, onChange, templateColors, customFonts }: StyleEditorProps) {
  const { toast } = useToast()
  const [fontName, setFontName] = useState("")
  const [fontFile, setFontFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleChange = (key: keyof ElementStyle) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    let value = e.target.value.trim()
    
    // Convert comma-separated values to space-separated for margin and padding
    if ((key === 'margin' || key === 'padding') && value) {
      value = value.replace(/,/g, ' ').replace(/\s+/g, ' ').replace(/;/g, '')
    }
    
    onChange({ 
      ...style, 
      [key]: value || undefined
    })
  }

  const handleColorChange = (key: keyof ElementStyle) => (value: string | undefined) => {
    onChange({
      ...style,
      [key]: value
    })
  }

  const handleFontUpload = async () => {
    if (!fontName || !fontFile) return

    // Get file extension
    const fileExt = fontFile.name.split('.').pop()?.toLowerCase()
    if (!fileExt || !['woff2', 'woff', 'ttf', 'otf'].includes(fileExt)) {
      toast({
        variant: "destructive",
        title: TRANSLATIONS.error,
        description: TRANSLATIONS.uploadFontError
      })
      return
    }

    setIsUploading(true)
    try {
      // Upload font file to storage
      const { data: fileData, error: fileError } = await supabase.storage
        .from('fonts')
        .upload(`${fontName}.${fileExt}`, fontFile)

      if (fileError) throw fileError

      // Save font info to database
      const { error: dbError } = await supabase
        .from('custom_fonts')
        .insert({
          name: fontName,
          file_path: fileData.path,
          font_family: fontName,
          format: fileExt
        })

      if (dbError) throw dbError

      toast({
        title: TRANSLATIONS.success,
        description: TRANSLATIONS.uploadFontSuccess
      })

      // Reset form
      setFontName("")
      setFontFile(null)
    } catch (error) {
      console.error('Error uploading font:', error)
      toast({
        variant: "destructive",
        title: TRANSLATIONS.error,
        description: TRANSLATIONS.uploadFontError
      })
    } finally {
      setIsUploading(false)
    }
  }

  // Logo style handler
  const handleLogoStyleChange = (key: keyof ElementStyle, value: string) => {
    onChange({ 
      ...style, 
      [key]: value || undefined
    })
  }

  return (
    <div className="p-4 space-y-4">
      {/* Logo Controls - show first for header */}
      {style && 'logoPosition' in style && (
        <div className="space-y-4 mb-8 bg-accent/20 p-4 rounded-lg">
          <h3 className="font-medium text-lg border-b pb-2">הגדרות לוגו</h3>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">רוחב לוגו</label>
            <Input
              value={style?.logoWidth || '100px'}
              onChange={(e) => onChange({ ...style, logoWidth: e.target.value })}
              placeholder="100px"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">גובה לוגו</label>
            <Input
              value={style?.logoHeight || 'auto'}
              onChange={(e) => onChange({ ...style, logoHeight: e.target.value })}
              placeholder="auto"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">מיקום לוגו</label>
            <Select 
              value={style?.logoPosition || 'top-right'}
              onValueChange={(value) => onChange({ ...style, logoPosition: value as ElementStyle['logoPosition'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top-left">שמאל למעלה</SelectItem>
                <SelectItem value="top-center">מרכז למעלה</SelectItem>
                <SelectItem value="top-right">ימין למעלה</SelectItem>
                <SelectItem value="center-left">שמאל מרכז</SelectItem>
                <SelectItem value="center">מרכז</SelectItem>
                <SelectItem value="center-right">ימין מרכז</SelectItem>
                <SelectItem value="bottom-left">שמאל למטה</SelectItem>
                <SelectItem value="bottom-center">מרכז למטה</SelectItem>
                <SelectItem value="bottom-right">ימין למטה</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">מרווח לוגו</label>
            <Input
              value={style?.logoMargin || '1rem'}
              onChange={(e) => onChange({ ...style, logoMargin: e.target.value })}
              placeholder="1rem"
            />
          </div>
        </div>
      )}

      {/* Regular style controls */}
      <div className="grid gap-4 p-4" dir="rtl">
        <div className="grid grid-cols-2 gap-4">
          <ColorPicker
            id="color"
            label={TRANSLATIONS.color}
            value={style?.color || ''}
            onChange={(value) => handleColorChange('color')(value)}
          />
          <ColorPicker
            id="backgroundColor"
            label={TRANSLATIONS.backgroundColor}
            value={style?.backgroundColor || ''}
            onChange={(value) => handleColorChange('backgroundColor')(value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{TRANSLATIONS.fontFamily}</Label>
            <Select
              value={style?.fontFamily || "inherit"}
              onValueChange={(value) => onChange({ ...style, fontFamily: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Custom fonts section */}
                {customFonts && customFonts.length > 0 && (
                  <>
                    {customFonts.map((font) => (
                      <SelectItem key={font.name} value={`'${font.font_family}', sans-serif`}>
                        {font.name}
                      </SelectItem>
                    ))}
                    <div className="h-[1px] my-2 bg-border" />
                  </>
                )}
                
                {/* Default fonts */}
                {HEBREW_FONTS.map((font) => (
                  <SelectItem key={font.value} value={font.value}>
                    {font.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{TRANSLATIONS.textAlign}</Label>
            <Select
              value={style?.textAlign || "inherit"}
              onValueChange={(value) => onChange({ ...style, textAlign: value as ElementStyle['textAlign'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">{TRANSLATIONS.none}</SelectItem>
                <SelectItem value="right">{TRANSLATIONS.alignRight}</SelectItem>
                <SelectItem value="left">{TRANSLATIONS.alignLeft}</SelectItem>
                <SelectItem value="center">{TRANSLATIONS.alignCenter}</SelectItem>
                <SelectItem value="justify">{TRANSLATIONS.alignJustify}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fontSize">{TRANSLATIONS.fontSize}</Label>
            <Input
              id="fontSize"
              type="text"
              value={style?.fontSize || ""}
              placeholder="16px"
              onChange={handleChange("fontSize")}
              dir="ltr"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="margin">{TRANSLATIONS.margin}</Label>
            <Input
              id="margin"
              type="text"
              value={style?.margin || ""}
              placeholder="1rem"
              onChange={handleChange("margin")}
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="padding">{TRANSLATIONS.padding}</Label>
            <Input
              id="padding"
              type="text"
              value={style?.padding || ""}
              placeholder="1rem"
              onChange={handleChange("padding")}
              dir="ltr"
            />
          </div>
        </div>
      </div>
      
      <div className="mt-4">
        <label className="text-sm font-medium">{TRANSLATIONS.customCss}</label>
        <Textarea
          placeholder={TRANSLATIONS.enterCustomCss}
          value={style?.customCss || ''}
          onChange={handleChange("customCss")}
          className="font-mono text-sm mt-2"
          dir="ltr"
        />
      </div>
    </div>
  )
} 