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
    console.log('Submission form_id:', submission.form_id);
    
    // Get template if exists
    console.log('Fetching template for form_id:', submission.form_id);
    
    const { data: template, error: templateError } = await supabase
      .from('templates')
      .select(`
        id,
        name,
        form_id,
        show_logo,
        logo_position,
        css,
        element_styles,
        header_content,
        footer_content,
        custom_fonts,
        logo:logos!inner(
          id,
          file_path
        )
      `)
      .eq('form_id', submission.form_id)
      .maybeSingle();

    console.log('Raw template data:', JSON.stringify(template, null, 2));
    console.log('Template error:', templateError);

    // Transform the logo array to a single object
    if (template?.logo && Array.isArray(template.logo)) {
      console.log('Logo before transform:', template.logo);
      const [firstLogo] = template.logo;
      // @ts-ignore - we know this is safe
      template.logo = firstLogo;
      console.log('Logo after transform:', template.logo);
    } else {
      console.log('Logo data is not in expected format:', template?.logo);
    }

    if (templateError) {
      console.error('Template error:', templateError);
    }

    // Return data even if template is not found
    const response = { 
      submission, 
      template: template || {
        id: null,
        name: 'תוצאות האבחון',
        css: '',
        show_logo: false,
        logo_position: 'top-left',
        logo: null,
        element_styles: {
          body: {},
          h1: {},
          p: {},
        }
      }
    };

    console.log('Final response template:', {
      id: response.template.id,
      show_logo: response.template.show_logo,
      logo_position: response.template.logo_position,
      logo: response.template.logo,
      has_logo: !!response.template.logo
    });
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