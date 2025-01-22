import { processSubmission } from '@/lib/claude'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase-admin'

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
export const maxDuration = 300; // 5 minutes timeout for Vercel Pro plan

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
  let submissionId: string | undefined;
  
  try {
    const body = await req.json();
    submissionId = body.submissionId;
    
    if (!submissionId) {
      return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 });
    }

    // Update status to processing
    await supabaseAdmin
      .from('form_submissions')
      .update({
        status: 'processing',
        progress: {
          stage: 'init',
          message: 'התחלת עיבוד',
          timestamp: new Date().toISOString()
        }
      })
      .eq('submission_id', submissionId);

    // Wait for the full process
    const result = await processSubmission(submissionId);

    return NextResponse.json({
      message: 'Processing completed',
      submissionId,
      result
    });
    
  } catch (error) {
    console.error('API error:', error);
    
    // Update status to error if we have a submissionId
    if (error instanceof Error && submissionId) {
      await supabaseAdmin
        .from('form_submissions')
        .update({
          status: 'error',
          progress: {
            stage: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
          }
        })
        .eq('submission_id', submissionId);
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 