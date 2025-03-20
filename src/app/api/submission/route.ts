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
      .or(`form_id.eq.${submissionId},submission_id.eq.${submissionId}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

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
        *,
        logo:logos(
          id,
          file_path
        ),
        template_contents(
          id,
          content_name,
          md_content,
          created_at
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
            
            // Split by headers but preserve tables
            const blocks = content.split(/(?=^#{1,6}\s)/m)
              .filter((block: string) => block.trim())
              .reduce((acc: string[], block: string) => {
                if (block.includes('\n---|')) {
                  const prevBlock = acc[acc.length - 1];
                  if (prevBlock && prevBlock.startsWith('#')) {
                    acc[acc.length - 1] = prevBlock + block;
                  } else {
                    acc.push(block);
                  }
                } else {
                  acc.push(block);
                }
                return acc;
              }, [])
              .map((block: string) => block.trim());

            console.log('Split blocks:', blocks);
            
            return blocks;
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
          body: {
            backgroundColor: '#ffffff',
            color: '#333333',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: '16px',
            lineHeight: '1.5'
          },
          h1: {
            fontSize: '2.5rem',
            fontWeight: 'bold',
            color: '#1a1a1a',
            marginBottom: '1.5rem',
            lineHeight: '1.2'
          },
          h2: {
            fontSize: '2rem',
            fontWeight: 'bold',
            color: '#1a1a1a',
            marginTop: '2rem',
            marginBottom: '1rem',
            lineHeight: '1.3'
          },
          h3: {
            fontSize: '1.75rem',
            fontWeight: 'bold',
            color: '#1a1a1a',
            marginTop: '1.5rem',
            marginBottom: '0.75rem',
            lineHeight: '1.4'
          },
          h4: {
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#1a1a1a',
            marginTop: '1.25rem',
            marginBottom: '0.5rem'
          },
          h5: {
            fontSize: '1.25rem',
            fontWeight: 'bold',
            color: '#1a1a1a',
            marginTop: '1rem',
            marginBottom: '0.5rem'
          },
          h6: {
            fontSize: '1.1rem',
            fontWeight: 'bold',
            color: '#1a1a1a',
            marginTop: '0.75rem',
            marginBottom: '0.5rem'
          },
          p: {
            marginBottom: '1rem',
            lineHeight: '1.7'
          },
          li: {
            marginLeft: '1.5rem',
            marginBottom: '0.5rem',
            listStyleType: 'inherit'
          },
          main: {
            maxWidth: '800px',
            margin: '0 auto',
            padding: '2rem'
          },
          prose: {
            color: '#333333'
          },
          header: {
            showLogo: false,
            logoWidth: '100px',
            logoHeight: 'auto',
            logoMargin: '1rem',
            logoPosition: 'top-right'
          },
          specialParagraph: {},
        },
        styles: {
          bodyBackground: '#ffffff',
          mainBackground: '#ffffff',
          contentBackground: '#ffffff'
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