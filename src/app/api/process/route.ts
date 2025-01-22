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
export const maxDuration = 900; // 15 minutes timeout for Vercel Pro plan

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

    // Start processing in the background
    processSubmission(submissionId).catch(async (error) => {
      console.error('Background processing error:', error);
      await supabaseAdmin
        .from('form_submissions')
        .update({
          status: 'error',
          progress: {
            stage: 'error',
            message: error instanceof Error ? error.message : 'שגיאה לא ידועה',
            timestamp: new Date().toISOString()
          }
        })
        .eq('submission_id', submissionId);
    });

    // Return immediately
    return NextResponse.json({
      message: 'Processing started',
      submissionId
    });
    
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 