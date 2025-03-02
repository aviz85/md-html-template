import { useState } from "react"
import { SubmissionStatus } from "@/types"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase-client"

export function useSubmissionData(formId?: string) {
  const { toast } = useToast()
  const [submissions, setSubmissions] = useState<SubmissionStatus[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionStatus | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  
  const fetchRecentSubmissions = async () => {
    if (!formId) return
    
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from("submissions")
        .select("*")
        .eq("form_id", formId)
        .order("created_at", { ascending: false })
        .limit(50)
      
      if (error) {
        throw error
      }
      
      if (data) {
        setSubmissions(data)
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error fetching submissions",
        description: error.message
      })
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleDetailsClick = (submission: SubmissionStatus) => {
    setSelectedSubmission(submission)
    setIsDialogOpen(true)
  }
  
  const formatLogEntry = (log: any) => {
    if (!log) return null
    
    return {
      timestamp: log.timestamp ? new Date(log.timestamp).toLocaleString() : "Unknown",
      stage: log.stage || "Unknown",
      message: log.message || "No message",
      details: log.details ? JSON.stringify(log.details, null, 2) : null
    }
  }
  
  return {
    submissions,
    isLoading,
    selectedSubmission,
    isDialogOpen,
    setIsDialogOpen,
    fetchRecentSubmissions,
    handleDetailsClick,
    formatLogEntry
  }
} 