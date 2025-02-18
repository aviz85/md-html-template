import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface TranscriptionResult {
  text: string;
  language?: string;
  segments?: {
    start: number;
    end: number;
    text: string;
  }[];
}

interface TranscriptionInput {
  segment_path: string;
  segment_index: number;
  total_segments: number;
  preferred_language?: string;
}

export async function transcribeAudio(input: TranscriptionInput): Promise<TranscriptionResult> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Get the file from storage
  const { data: fileData, error: fileError } = await supabase.storage
    .from('transcriptions')
    .download(input.segment_path)

  if (fileError) {
    throw new Error(`Failed to get audio file: ${fileError.message}`)
  }

  // Convert to FormData
  const formData = new FormData()
  formData.append('file', new Blob([fileData]), 'audio.mp3')
  formData.append('model', 'whisper-large-v3-turbo')
  formData.append('response_format', 'verbose_json')

  if (input.preferred_language) {
    formData.append('language', input.preferred_language)
  }

  // Call Groq API
  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('GROQ_API_KEY')}`
    },
    body: formData
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Groq API error: ${error}`)
  }

  const result = await response.json()

  // Process segments if available
  const segments = result.segments?.map((s: any) => ({
    start: s.start,
    end: s.end,
    text: s.text
  }))

  return {
    text: result.text,
    language: result.language,
    segments
  }
} 