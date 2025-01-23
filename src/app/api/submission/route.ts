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

interface Template {
  id: any;
  name: any;
  form_id: any;
  show_logo: any;
  logo_position: any;
  css: any;
  element_styles: any;
  header_content: any;
  footer_content: any;
  custom_fonts: any;
  logo: { id: any; file_path: any; }[];
  template_contents: { content_name: string; md_content: string; }[];
  custom_contents?: Record<string, string>;
  opening_page_content?: string;
  closing_page_content?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const submissionId = searchParams.get('submissionId') || searchParams.get('s');

  console.log('Fetching submission:', submissionId);

  if (!submissionId) {
    return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 });
  }

  try {
    console.log('Making Supabase query for submission...');
    
    // Add 2 second delay before fetching submission
    await new Promise(resolve => setTimeout(resolve, 2000));
    
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
        ),
        template_contents(
          content_name,
          md_content
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

    // Process custom contents
    if (template?.template_contents) {
      console.log('Processing template contents:', template.template_contents);
      const custom_contents: Record<string, string> = {};
      let opening_page_content = '';
      let closing_page_content = '';

      template.template_contents.forEach((content: any) => {
        if (content.content_name.startsWith('custom_')) {
          const tag = content.content_name.replace('custom_', '');
          custom_contents[tag] = content.md_content;
          console.log(`Added custom content - Tag: ${tag}, Content:`, content.md_content);
        } else if (content.content_name === 'opening_page') {
          opening_page_content = content.md_content;
          console.log('Found opening page content');
        } else if (content.content_name === 'closing_page') {
          closing_page_content = content.md_content;
          console.log('Found closing page content');
        }
      });

      console.log('Final custom contents:', custom_contents);
      Object.assign(template, {
        custom_contents,
        opening_page_content,
        closing_page_content
      });
    } else {
      console.log('No template contents found');
    }

    if (templateError) {
      console.error('Template error:', templateError);
    }

    // Return data even if template is not found
    const response = { 
      submission: {
        ...submission,
        result: submission.result ? {
          ...submission.result,
          finalResponse: (() => {
            const content = submission.result.finalResponse;
            console.log('Original content:', content);
            
            const matches = content?.match(/`````[\s\S]*?`````|[^`]+/g);
            console.log('Matches found:', matches);
            
            const processed = matches?.map((block: string) => {
              const isWrapped = block.startsWith('`````');
              console.log('Processing block:', {
                isWrapped,
                length: block.length,
                preview: block.slice(0, 100)
              });
              return isWrapped ? block.slice(5, -5).trim() : block.trim();
            }).filter(Boolean);
            
            console.log('Final processed blocks:', processed?.length);
            return processed;
          })()
        } : null
      }, 
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