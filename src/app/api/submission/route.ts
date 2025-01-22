import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Debug logs for environment variables
console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'Missing');
console.log('Service Role Key:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Missing');

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const submissionId = searchParams.get('submissionId') || searchParams.get('s');

  console.log('Fetching submission:', submissionId);

  if (!submissionId) {
    return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 });
  }

  try {
    console.log('Making Supabase query for submission...');
    // Get submission
    const { data: submission, error: submissionError } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('submission_id', submissionId)
      .single();

    console.log('Submission query result:', { submission, error: submissionError });

    if (submissionError) {
      console.error('Submission error:', submissionError);
      return NextResponse.json({ 
        error: 'לא נמצא טופס עם המזהה הזה',
        details: submissionError 
      }, { status: 404 });
    }

    console.log('Found submission, fetching template...');
    // Get template if exists
    const { data: template, error: templateError } = await supabase
      .from('templates')
      .select(`
        *,
        logo:logos(*)
      `)
      .eq('form_id', submission.form_id)
      .maybeSingle();

    console.log('Template query result:', { template, error: templateError });

    if (templateError) {
      console.error('Template error:', templateError);
    }

    // Return data even if template is not found
    const response = { 
      submission, 
      template: template || {
        name: 'תוצאות האבחון',
        css: '',
        element_styles: {
          body: {},
          h1: {},
          p: {},
        }
      }
    };

    console.log('Sending response:', response);
    return NextResponse.json(response);
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'אירעה שגיאה בלתי צפויה',
        details: error
      },
      { status: 500 }
    );
  }
} 