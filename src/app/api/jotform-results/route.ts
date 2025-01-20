import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    console.log('Starting to process request...');
    
    // Get raw body and headers for logging
    const rawBody = await request.text();
    const headers = Object.fromEntries(request.headers.entries());
    const contentType = headers['content-type'] || '';
    
    console.log('Content-Type:', contentType);
    console.log('Raw Headers:', headers);
    console.log('Raw Body:', rawBody);
    
    // Save raw data
    const { error: rawError } = await supabase
      .from('raw_submissions')
      .insert({
        headers,
        body: rawBody,
        content_type: contentType,
      });
      
    if (rawError) {
      console.error('Error saving raw data:', rawError);
    }
    
    // Parse the body based on content type
    let formData: any = {};
    let parseError = null;
    
    try {
      if (contentType.includes('application/json')) {
        formData = JSON.parse(rawBody);
      } else {
        const rawFormData = await (new Response(rawBody).formData());
        formData = Object.fromEntries(Array.from(rawFormData.entries()));
      }
      
      // Update raw submission with parsed data
      await supabase
        .from('raw_submissions')
        .update({ parsed_body: formData })
        .eq('body', rawBody);
        
    } catch (error) {
      const e = error as Error;
      parseError = e;
      console.error('Error parsing form data:', e);
      
      // Update raw submission with error
      await supabase
        .from('raw_submissions')
        .update({ error: e.message })
        .eq('body', rawBody);
        
      return new Response(`
        <html dir="rtl">
          <head><title>שגיאה בעיבוד הנתונים</title></head>
          <body>
            <h1>שגיאה בעיבוד הנתונים מהטופס</h1>
            <pre dir="ltr">${e.message}</pre>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        status: 400
      });
    }
    
    if (!formData || Object.keys(formData).length === 0) {
      console.log('No form data received');
      return new Response(`
        <html dir="rtl">
          <head>
            <title>שגיאה</title>
            <meta charset="utf-8">
          </head>
          <body>
            <h1>שגיאה: לא התקבל מידע מהטופס</h1>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        status: 400
      });
    }

    // Extract form and submission IDs from JotForm data
    const formId = formData.formID || 'unknown';
    const submissionId = formData.submissionID || new Date().getTime().toString();
    
    console.log('Form ID:', formId);
    console.log('Submission ID:', submissionId);

    // Save to database
    console.log('Saving to database...');
    const { data: submission, error } = await supabase
      .from('form_submissions')
      .insert({
        form_id: formId,
        submission_id: submissionId,
        content: formData,
        status: 'pending'
      })
      .select('*')
      .single();

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    console.log('Successfully saved submission:', submission);

    // Return response page with realtime subscription
    return new Response(`
      <!DOCTYPE html>
      <html dir="rtl">
        <head>
          <title>תוצאות הטופס</title>
          <meta charset="utf-8">
          <script src="https://cdn.tailwindcss.com"></script>
          <script src="https://unpkg.com/@supabase/supabase-js@2"></script>
          <script>
            const supabase = supabase.createClient(
              '${process.env.NEXT_PUBLIC_SUPABASE_URL}',
              '${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}'
            );

            // Subscribe to changes
            const subscription = supabase
              .channel('form_results')
              .on(
                'postgres_changes',
                {
                  event: 'UPDATE',
                  schema: 'public',
                  table: 'form_submissions',
                  filter: 'id=eq.${submission.id}'
                },
                (payload) => {
                  if (payload.new.status === 'completed') {
                    document.getElementById('status').textContent = 'הושלם';
                    document.getElementById('result').textContent = 
                      JSON.stringify(payload.new.result, null, 2);
                    subscription.unsubscribe();
                  }
                }
              )
              .subscribe();
          </script>
        </head>
        <body class="bg-gray-50">
          <div class="container mx-auto p-8">
            <div class="bg-white rounded-lg shadow-lg p-6 mb-8">
              <h1 class="text-2xl font-bold mb-4">תוצאות</h1>
              <div class="flex items-center gap-2 mb-4">
                <span>סטטוס:</span>
                <span id="status" class="font-bold">בעיבוד...</span>
              </div>
              <div class="text-lg" id="result">מעבד את הנתונים...</div>
            </div>
            
            <div class="bg-gray-100 rounded-lg p-6">
              <h2 class="text-xl font-semibold mb-4">מידע מהטופס</h2>
              <pre class="bg-gray-800 text-white p-4 rounded overflow-auto" dir="ltr">
                ${JSON.stringify(formData, null, 2)}
              </pre>
            </div>
          </div>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  } catch (error) {
    console.error('Error details:', error);
    return new Response(`
      <html dir="rtl">
        <head>
          <title>שגיאה</title>
          <meta charset="utf-8">
        </head>
        <body>
          <h1>שגיאה בעיבוד הטופס</h1>
          <pre dir="ltr">${error instanceof Error ? error.message + '\n' + error.stack : JSON.stringify(error, null, 2)}</pre>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 400
    });
  }
} 