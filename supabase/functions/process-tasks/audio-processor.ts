import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface AudioSegment {
  path: string;
  index: number;
  duration: number;
}

interface ProcessingInput {
  file_path: string;
  should_split?: boolean;
  overlap_duration?: number;
  max_segment_size?: number;
}

export async function processAudioSegment(
  input: ProcessingInput,
  shouldSplit = false
): Promise<AudioSegment | AudioSegment[]> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Get the file from storage
  const { data: fileData, error: fileError } = await supabase.storage
    .from('transcriptions')
    .download(input.file_path)

  if (fileError) {
    throw new Error(`Failed to get audio file: ${fileError.message}`)
  }

  // Since we can't use ffmpeg in Edge Runtime, we'll skip conversion
  // and just pass the original file to Groq
  const outputPath = `${input.file_path.replace(/\.[^/.]+$/, '')}_processed.mp3`
  
  // Upload the file back to storage
  const { error: uploadError } = await supabase.storage
    .from('transcriptions')
    .upload(outputPath, fileData, { contentType: 'audio/mpeg' })

  if (uploadError) {
    throw new Error(`Failed to upload processed file: ${uploadError.message}`)
  }

  return {
    path: outputPath,
    index: 0,
    duration: 0 // We can't get duration without ffmpeg
  }
} 