import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    console.log('Starting to process request...');
    
    // Get content type
    const contentType = request.headers.get('content-type') || '';
    console.log('Content-Type:', contentType);
    
    // Parse the body based on content type
    let formData: any = {};
    let rawBody = '';
    
    if (contentType.includes('application/json')) {
      rawBody = await request.text();
      formData = JSON.parse(rawBody);
    } else if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      const formDataObj = await request.formData();
      formData = Object.fromEntries(formDataObj.entries());
      rawBody = JSON.stringify(formData);
    } else {
      throw new Error('Content-Type must be one of "application/json", "multipart/form-data", or "application/x-www-form-urlencoded"');
    }
    
    // Save raw data
    const { error: rawError } = await supabase
      .from('raw_submissions')
      .insert({
        headers: Object.fromEntries(request.headers.entries()),
        body: rawBody,
        content_type: contentType,
        parsed_body: formData
      });
      
    if (rawError) {
      console.error('Error saving raw data:', rawError);
    }
    
    // Extract form and submission IDs
    const formId = formData.formID || formData['form_id'] || 'unknown';
    const submissionId = formData.submissionID || formData['submission_id'] || new Date().getTime().toString();
    
    console.log('Form ID:', formId);
    console.log('Submission ID:', submissionId);
    console.log('Parsed form data:', formData);

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

    // Return response page
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
          <pre dir="ltr">${error instanceof Error ? error.message : JSON.stringify(error, null, 2)}</pre>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 400
    });
  }
} 