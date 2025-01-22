import { processSubmission } from '@/lib/claude'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export const runtime = 'nodejs'  // Changed from edge to nodejs
export const maxDuration = 300 // 5 minutes timeout

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const submissionId = searchParams.get('submissionId')
  
  if (!submissionId) {
    return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 })
  }

  try {
    const result = await processSubmission(submissionId)
    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('Error processing submission:', error)
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { submissionId } = await req.json();
    
    if (!submissionId) {
      return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 });
    }

    // התחל את העיבוד ברקע
    processSubmission(submissionId).catch(error => {
      console.error('Background processing error:', error);
    });

    // החזר תשובה מיד
    return NextResponse.json({ 
      status: 'processing',
      message: 'Processing started in background',
      submissionId 
    });
    
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 