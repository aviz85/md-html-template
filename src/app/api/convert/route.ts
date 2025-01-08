import { createClient } from '@supabase/supabase-js';
import { marked } from 'marked';
import { extractUsedFonts, generateGoogleFontsUrl, generateHtmlTemplate } from "@/lib/constants";

interface Template {
  id: string
  name: string
  css: string
  template_gsheets_id?: string
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
      .eq('template_gsheets_id', templateId)
      .single();

    if (templateError) {
      console.error('Template error:', templateError);
      return new Response(JSON.stringify({ error: templateError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const typedTemplate = template as Template;
    const usedFonts = extractUsedFonts(typedTemplate.css);
    const googleFontsUrl = generateGoogleFontsUrl(usedFonts);

    const htmlContents = await Promise.all(mdContents.map(async (md: string) => {
      const html = await marked.parse(md);
      return generateHtmlTemplate(html, typedTemplate.css, googleFontsUrl);
    }));

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