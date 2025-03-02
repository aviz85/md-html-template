import { useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase-client"
import { MediaFile } from "@/types"
import { v4 as uuidv4 } from "uuid"

export function useMediaManagement() {
  const { toast } = useToast()
  const [isUploading, setIsUploading] = useState(false)
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const loadMedia = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from("media")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) {
        throw error
      }

      if (data) {
        setMediaFiles(data)
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error loading media",
        description: error.message
      })
    } finally {
      setIsLoading(false)
    }
  }

  const uploadMedia = async (file: File, type: "logo" | "image" | "font") => {
    if (!file) return null
    
    setIsUploading(true)
    try {
      const fileExt = file.name.split(".").pop()
      const filePath = `${type}s/${uuidv4()}.${fileExt}`
      
      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from("media")
        .upload(filePath, file)
      
      if (uploadError) {
        throw uploadError
      }
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from("media")
        .getPublicUrl(filePath)
      
      // Store metadata in database
      const { error: dbError } = await supabase
        .from("media")
        .insert({
          name: file.name,
          url: urlData.publicUrl,
          type,
          file_path: filePath
        })
      
      if (dbError) {
        throw dbError
      }
      
      toast({
        title: "Upload successful",
        description: `${file.name} has been uploaded.`
      })
      
      await loadMedia()
      
      return urlData.publicUrl
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message
      })
      return null
    } finally {
      setIsUploading(false)
    }
  }

  const uploadFont = async (file: File, fontName: string, fontFamily: string) => {
    if (!file) return null
    
    setIsUploading(true)
    try {
      const fileExt = file.name.split(".").pop()
      const filePath = `fonts/${uuidv4()}.${fileExt}`
      
      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from("media")
        .upload(filePath, file)
      
      if (uploadError) {
        throw uploadError
      }
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from("media")
        .getPublicUrl(filePath)
      
      toast({
        title: "Font uploaded",
        description: `${fontName} has been uploaded successfully.`
      })
      
      return {
        name: fontName,
        file_path: urlData.publicUrl,
        font_family: fontFamily,
        format: fileExt
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Font upload failed",
        description: error.message
      })
      return null
    } finally {
      setIsUploading(false)
    }
  }

  const deleteMedia = async (url: string) => {
    try {
      // Find the media item
      const mediaItem = mediaFiles.find(item => item.url === url)
      
      if (!mediaItem) {
        throw new Error("Media not found")
      }
      
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("media")
        .remove([mediaItem.url.split("media/")[1]])
      
      if (storageError) {
        throw storageError
      }
      
      // Delete from database
      const { error: dbError } = await supabase
        .from("media")
        .delete()
        .eq("url", url)
      
      if (dbError) {
        throw dbError
      }
      
      toast({
        title: "Deleted",
        description: `${mediaItem.name} has been deleted.`
      })
      
      await loadMedia()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: error.message
      })
    }
  }

  return {
    isUploading,
    mediaFiles,
    isLoading,
    loadMedia,
    uploadMedia,
    uploadFont,
    deleteMedia
  }
} 