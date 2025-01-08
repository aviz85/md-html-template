import { createClient } from '@supabase/supabase-js';
import { marked } from 'marked';

interface Template {
  id: string
  name: string
  css: string
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { templateId, mdContents } = await req.json();

    const { data: template, error: templateError } = await supabase
      .from('templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError) {
      console.error('Template error:', templateError);
      return new Response(JSON.stringify({ error: templateError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const typedTemplate = template as Template;

    const htmlContents = mdContents.map((md: string) => {
      const html = marked.parse(md);
      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${typedTemplate.css}
  </style>
</head>
<body>
  ${html}
</body>
</html>`;
    });

    return new Response(JSON.stringify({ htmlContents }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}