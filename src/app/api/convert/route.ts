import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { promises as fs } from 'fs';
import path from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const runtime = 'nodejs';
// Increase timeout for large files
export const maxDuration = 600; // 10 minutes

// Configure chunk size for streaming (10MB)
const CHUNK_SIZE = 10 * 1024 * 1024;

async function downloadFile(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  // Stream large files
  if (response.headers.get('content-length')) {
    const contentLength = parseInt(response.headers.get('content-length')!);
    if (contentLength > CHUNK_SIZE) {
      const chunks: Buffer[] = [];
      const reader = response.body!.getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
      }
      
      return Buffer.concat(chunks);
    }
  }

  return Buffer.from(await response.arrayBuffer());
}

async function convertToMp3(inputBuffer: Buffer, inputFormat: string): Promise<Buffer> {
  const ffmpeg = new FFmpeg();
  
  try {
    // Load ffmpeg
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    // Write input data
    await ffmpeg.writeFile('input.' + inputFormat, inputBuffer);

    // Convert to MP3 with speech-optimized settings
    await ffmpeg.exec([
      '-i', 'input.' + inputFormat,
      // Speech-optimized settings
      '-c:a', 'libmp3lame',
      '-b:a', '96k',
      '-ac', '2',
      '-ar', '22050',
      // Audio filters for speech
      '-af', 'silenceremove=1:0:-50dB,dynaudnorm',
      'output.mp3'
    ]);

    // Read the output file
    const data = await ffmpeg.readFile('output.mp3');
    return Buffer.from(data);

  } finally {
    // Cleanup
    await ffmpeg.terminate();
  }
}

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json(
        { error: 'No URL provided' },
        { status: 400 }
      );
    }

    // Extract original format
    const format = path.extname(url).slice(1).toLowerCase();
    if (!['wav', 'mp4', 'ogg', 'webm', 'm4a', 'aac', 'mp3'].includes(format)) {
      return NextResponse.json(
        { error: 'Unsupported audio format' },
        { status: 400 }
      );
    }

    // Download file
    console.log(`Downloading file from ${url}`);
    const inputBuffer = await downloadFile(url);

    // Convert to MP3
    console.log('Converting to MP3...');
    const outputBuffer = await convertToMp3(inputBuffer, format);

    // Upload to Supabase with chunking for large files
    const fileName = `converted_${Date.now()}.mp3`;
    const filePath = `converted/${fileName}`;

    console.log(`Uploading converted file to ${filePath}`);
    
    let uploadError;
    if (outputBuffer.length > CHUNK_SIZE) {
      // Upload in chunks
      const chunks = Math.ceil(outputBuffer.length / CHUNK_SIZE);
      for (let i = 0; i < chunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, outputBuffer.length);
        const chunk = outputBuffer.subarray(start, end);
        
        const { error } = await supabase.storage
          .from('transcriptions')
          .upload(
            `${filePath}_part${i}`, 
            chunk,
            {
              contentType: 'application/octet-stream',
              upsert: true
            }
          );
        
        if (error) {
          uploadError = error;
          break;
        }
      }
      
      // Merge chunks if all uploaded successfully
      if (!uploadError) {
        // Final upload with all parts
        const { error } = await supabase.storage
          .from('transcriptions')
          .upload(filePath, outputBuffer, {
            contentType: 'audio/mpeg',
            cacheControl: '3600'
          });
        uploadError = error;
      }
    } else {
      // Direct upload for smaller files
      const { error } = await supabase.storage
        .from('transcriptions')
        .upload(filePath, outputBuffer, {
          contentType: 'audio/mpeg',
          cacheControl: '3600'
        });
      uploadError = error;
    }

    if (uploadError) {
      throw uploadError;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('transcriptions')
      .getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      convertedUrl: publicUrl,
      format: 'mp3',
      originalSize: inputBuffer.length,
      convertedSize: outputBuffer.length,
      compressionRatio: Math.round((1 - outputBuffer.length / inputBuffer.length) * 100) + '%'
    });

  } catch (error) {
    console.error('Conversion error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error
      },
      { status: 500 }
    );
  }
} 