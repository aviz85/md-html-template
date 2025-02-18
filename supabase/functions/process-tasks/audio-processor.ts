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

  // Convert to FLAC using FFmpeg
  const command = new Deno.Command('ffmpeg', {
    args: [
      '-i', 'pipe:0',          // Input from pipe
      '-ar', '16000',          // Sample rate
      '-ac', '1',              // Mono
      '-c:a', 'flac',          // FLAC codec
      'pipe:1'                 // Output to pipe
    ],
    stdin: 'piped',
    stdout: 'piped'
  })

  const process = command.spawn()
  const writer = process.stdin.getWriter()
  await writer.write(fileData)
  await writer.close()
  
  const { stdout } = await process.output()
  const convertedData = stdout

  if (!shouldSplit) {
    // Upload converted file
    const { error: uploadError } = await supabase.storage
      .from('transcriptions')
      .upload(
        `${input.file_path.replace(/\.[^/.]+$/, '')}_converted.flac`,
        convertedData,
        { contentType: 'audio/flac' }
      )

    if (uploadError) {
      throw new Error(`Failed to upload converted file: ${uploadError.message}`)
    }

    return {
      path: `${input.file_path.replace(/\.[^/.]+$/, '')}_converted.flac`,
      index: 0,
      duration: 0 // TODO: Get actual duration
    }
  }

  // Get audio duration using FFprobe
  const durationCommand = new Deno.Command('ffprobe', {
    args: [
      '-i', 'pipe:0',
      '-show_entries', 'format=duration',
      '-v', 'quiet',
      '-of', 'csv=p=0'
    ],
    stdin: 'piped',
    stdout: 'piped'
  })

  const durationProcess = durationCommand.spawn()
  const durationWriter = durationProcess.stdin.getWriter()
  await durationWriter.write(fileData)
  await durationWriter.close()
  
  const { stdout: durationOut } = await durationProcess.output()
  const duration = parseFloat(new TextDecoder().decode(durationOut))

  // Calculate segments
  const overlapDuration = input.overlap_duration || 10 // 10 seconds overlap
  const maxDuration = (input.max_segment_size || 20 * 1024 * 1024) / (16000 * 2) // Approximate duration for 20MB FLAC
  const segments: AudioSegment[] = []

  let startTime = 0
  let segmentIndex = 0

  while (startTime < duration) {
    const endTime = Math.min(startTime + maxDuration, duration)
    
    // Split using FFmpeg
    const splitCommand = new Deno.Command('ffmpeg', {
      args: [
        '-i', 'pipe:0',
        '-ss', startTime.toString(),
        '-t', (endTime - startTime + overlapDuration).toString(),
        '-ar', '16000',
        '-ac', '1',
        '-c:a', 'flac',
        'pipe:1'
      ],
      stdin: 'piped',
      stdout: 'piped'
    })

    const splitProcess = splitCommand.spawn()
    const splitWriter = splitProcess.stdin.getWriter()
    await splitWriter.write(fileData)
    await splitWriter.close()
    
    const { stdout: segmentData } = await splitProcess.output()

    // Upload segment
    const segmentPath = `${input.file_path.replace(/\.[^/.]+$/, '')}_segment_${segmentIndex}.flac`
    const { error: uploadError } = await supabase.storage
      .from('transcriptions')
      .upload(segmentPath, segmentData, { contentType: 'audio/flac' })

    if (uploadError) {
      throw new Error(`Failed to upload segment ${segmentIndex}: ${uploadError.message}`)
    }

    segments.push({
      path: segmentPath,
      index: segmentIndex,
      duration: endTime - startTime
    })

    startTime = endTime - overlapDuration
    segmentIndex++
  }

  return segments
} 