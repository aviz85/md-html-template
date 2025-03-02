import React, { useState } from "react"
import { useTemplate } from "@/contexts/TemplateContext"
import { StyleEditor } from "@/components/style-editor"
import { ElementType, MediaFile, ElementStyle, Template } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ColorPicker } from "@/components/ui/color-picker"
import { TRANSLATIONS } from "@/lib/translations"
import { 
  Upload, 
  Trash2, 
  ImageIcon, 
  HelpCircle 
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useMediaManagement } from "@/hooks/template/useMediaManagement"

export function StylesTab() {
  const { 
    template, 
    setTemplate, 
    elementStyles, 
    setElementStyles, 
    activeElement, 
    setActiveElement,
    generatePreview
  } = useTemplate()

  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false)
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false)
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([])
  const [showMediaInstructions, setShowMediaInstructions] = useState(false)
  
  const { 
    isUploading, 
    uploadMedia, 
    deleteMedia
  } = useMediaManagement()

  const handleStyleChange = (style: any) => {
    setElementStyles((prev: Record<ElementType, ElementStyle>) => ({
      ...prev,
      [activeElement]: style
    }))
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    
    const file = e.target.files[0]
    const url = await uploadMedia(file, "logo")
    
    if (url) {
      setTemplate((prev: Template | null) => prev ? { ...prev, logo_path: url } : null)
    }
  }

  const handleLogoDelete = async () => {
    if (template?.logo_path) {
      await deleteMedia(template.logo_path)
      setTemplate((prev: Template | null) => prev ? { ...prev, logo_path: undefined } : null)
    }
  }

  const handleColorChange = (color: string, type: 'body' | 'main' | 'content') => {
    setTemplate((prev: Template | null) => {
      if (!prev) return null
      
      return {
        ...prev,
        styles: {
          ...prev.styles,
          [type === 'body' ? 'bodyBackground' : type === 'main' ? 'mainBackground' : 'contentBackground']: color
        }
      }
    })
  }

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    
    const file = e.target.files[0]
    await uploadMedia(file, "image")
  }

  const handleMediaDelete = async (url: string) => {
    await deleteMedia(url)
  }

  return (
    <div className="flex-1 flex">
      <div className="w-48 border-r">
        <div className="p-4">
          <div className="text-sm font-medium mb-2">{TRANSLATIONS.elements}</div>
          <div className="space-y-1">
            {Object.keys(elementStyles).map((element) => (
              <div
                key={element}
                className={`px-3 py-1 text-sm rounded cursor-pointer ${
                  activeElement === element ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                }`}
                onClick={() => setActiveElement(element as ElementType)}
              >
                {element}
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="flex-1 p-4 overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">
            {TRANSLATIONS.styleSettings}: {activeElement}
          </h2>
          <Button onClick={() => generatePreview()}>
            {TRANSLATIONS.preview}
          </Button>
        </div>
        
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-md font-medium mb-2">{TRANSLATIONS.elementStyles}</h3>
                <StyleEditor
                  style={elementStyles[activeElement] || {}}
                  onChange={handleStyleChange}
                />
              </div>
              
              <div>
                <h3 className="text-md font-medium mb-2">{TRANSLATIONS.backgroundColors}</h3>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <label className="w-32 text-sm">{TRANSLATIONS.bodyBackground}</label>
                    <ColorPicker
                      id="bodyBackground"
                      label={TRANSLATIONS.bodyBackground}
                      value={template?.styles?.bodyBackground || "#ffffff"}
                      onChange={(color) => handleColorChange(color || "#ffffff", "body")}
                    />
                  </div>
                  <div className="flex items-center">
                    <label className="w-32 text-sm">{TRANSLATIONS.mainBackground}</label>
                    <ColorPicker
                      id="mainBackground"
                      label={TRANSLATIONS.mainBackground}
                      value={template?.styles?.mainBackground || "#ffffff"}
                      onChange={(color) => handleColorChange(color || "#ffffff", "main")}
                    />
                  </div>
                  <div className="flex items-center">
                    <label className="w-32 text-sm">{TRANSLATIONS.contentBackground}</label>
                    <ColorPicker
                      id="contentBackground"
                      label={TRANSLATIONS.contentBackground}
                      value={template?.styles?.contentBackground || "#ffffff"}
                      onChange={(color) => handleColorChange(color || "#ffffff", "content")}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-md font-medium mb-2">{TRANSLATIONS.logo}</h3>
                <div className="flex flex-col space-y-2">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsLogoModalOpen(true)}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {TRANSLATIONS.uploadLogo}
                    </Button>
                    
                    {template?.logo_path && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleLogoDelete}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {TRANSLATIONS.removeLogo}
                      </Button>
                    )}
                  </div>
                  
                  {template?.logo_path && (
                    <div className="mt-2 border rounded p-2 max-w-xs">
                      <img
                        src={template.logo_path}
                        alt="Logo"
                        className="max-h-24 max-w-full"
                      />
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <h3 className="text-md font-medium mb-2">
                  {TRANSLATIONS.mediaLibrary}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-2"
                    onClick={() => setShowMediaInstructions(!showMediaInstructions)}
                  >
                    <HelpCircle className="h-4 w-4" />
                  </Button>
                </h3>
                
                {showMediaInstructions && (
                  <div className="bg-muted p-3 rounded-md mb-3 text-sm">
                    <p>{TRANSLATIONS.mediaInstructions}</p>
                    <code className="block mt-1 bg-background p-1 rounded">
                      ![{TRANSLATIONS.imageDescription}](media-url)
                    </code>
                  </div>
                )}
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsMediaModalOpen(true)}
                >
                  <ImageIcon className="h-4 w-4 mr-2" />
                  {TRANSLATIONS.manageMedia}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Logo Upload Dialog */}
      <Dialog open={isLogoModalOpen} onOpenChange={setIsLogoModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{TRANSLATIONS.uploadLogo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <label htmlFor="logo-upload" className="text-sm font-medium">
                {TRANSLATIONS.logo}
              </label>
              <Input
                id="logo-upload"
                type="file"
                accept=".png,.jpg,.jpeg,.svg,.webp"
                disabled={isUploading}
                onChange={handleLogoUpload}
              />
            </div>
            {isUploading && <div>{TRANSLATIONS.uploading}...</div>}
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Media Manager Dialog */}
      <Dialog open={isMediaModalOpen} onOpenChange={setIsMediaModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{TRANSLATIONS.mediaLibrary}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <label htmlFor="media-upload" className="text-sm font-medium">
                {TRANSLATIONS.uploadMedia}
              </label>
              <Input
                id="media-upload"
                type="file"
                accept=".png,.jpg,.jpeg,.svg,.webp,.gif"
                disabled={isUploading}
                onChange={handleMediaUpload}
              />
            </div>
            {isUploading && <div>{TRANSLATIONS.uploading}...</div>}
            
            <div className="grid grid-cols-3 gap-4">
              {mediaFiles.map((file) => (
                <div key={file.url} className="border rounded-md p-2">
                  <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                    <img
                      src={file.url}
                      alt={file.name}
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <div className="mt-2 flex justify-between items-center">
                    <div className="text-xs truncate" title={file.name}>
                      {file.name}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMediaDelete(file.url)}
                      className="h-7 w-7 p-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div
                    className="text-xs text-muted-foreground mt-1 truncate cursor-pointer"
                    onClick={() => {
                      navigator.clipboard.writeText(file.url)
                      alert(TRANSLATIONS.urlCopied)
                    }}
                  >
                    {file.url}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
} 