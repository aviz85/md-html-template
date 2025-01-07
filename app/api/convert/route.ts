import { createClient } from '@supabase/supabase-js';
import { marked } from 'marked';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
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
  
      const htmlContents = mdContents.map((md: string) => {
        const html = marked.parse(md);
        return `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      :root {
        ${template.color1 ? `--color1: ${template.color1};` : ''}
        ${template.color2 ? `--color2: ${template.color2};` : ''}
        ${template.color3 ? `--color3: ${template.color3};` : ''}
        ${template.color4 ? `--color4: ${template.color4};` : ''}
      }
      ${template.css}
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