import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'edge';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const submissionId = searchParams.get('id');

    if (!submissionId) {
      return NextResponse.json({ error: 'Missing submission ID' }, { status: 400 });
    }

    const { data: submission, error } = await supabaseAdmin
      .from('form_submissions')
      .select('*')
      .eq('submission_id', submissionId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    return NextResponse.json({
      status: submission.status,
      progress: submission.progress,
      result: submission.result,
      email_status: submission.email_status,
      email_error: submission.email_error,
      created_at: submission.created_at,
      updated_at: submission.updated_at
    });

  } catch (error) {
    console.error('Error checking status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 