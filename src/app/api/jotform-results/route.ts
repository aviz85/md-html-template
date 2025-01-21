import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processSubmission } from '@/lib/claude';

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
      
      // Parse the rawRequest field if it exists
      if (formData.rawRequest) {
        try {
          formData.parsedRequest = JSON.parse(formData.rawRequest);
        } catch (e) {
          console.error('Failed to parse rawRequest:', e);
          // אם הפרסור נכשל, נשמור את ה-rawRequest כמו שהוא
          formData.parsedRequest = formData.rawRequest;
        }
      }
    } else if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      const formDataObj = await request.formData();
      formData = Object.fromEntries(formDataObj.entries());
      console.log('Form data after parsing:', formData);
      
      // פרסור של rawRequest אם קיים
      if (formData.rawRequest) {
        try {
          const parsedRawRequest = JSON.parse(formData.rawRequest);
          console.log('Parsed rawRequest:', parsedRawRequest);
          formData.parsedRequest = parsedRawRequest;
        } catch (e) {
          console.error('Failed to parse rawRequest:', e);
          formData.parsedRequest = formData.rawRequest;
        }
      }
      
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

    // Extract form and submission IDs from the webhook data
    const formId = formData.formID;
    const submissionId = formData.submissionID;
    
    // Prepare the content object with all form fields
    let content;
    try {
      const parsedFields = JSON.parse(formData.rawRequest);
      content = {
        form_data: parsedFields,
        metadata: {
          submission_id: formData.submissionID,
          form_id: formData.formID
        },
        raw: formData
      };
      
      console.log('Content before save:', content);
    } catch (e) {
      console.error('Failed to parse content:', e);
      content = formData;
    }

    console.log('Form ID:', formId);
    console.log('Submission ID:', submissionId);
    console.log('Content:', content);

    // Save to database
    console.log('Saving to database...');
    const { data: submission, error } = await supabase
      .from('form_submissions')
      .insert({
        form_id: formData.formID,
        submission_id: formData.submissionID,
        content: content || {},
        status: 'pending'
      })
      .select('*')
      .single();

    console.log('Saved submission:', submission);

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    // התחל עיבוד מול קלוד באופן אסינכרוני
    processSubmission(submission.id).catch(error => {
      console.error('Error processing submission:', error);
      supabase
        .from('form_submissions')
        .update({
          status: 'error',
          result: { error: error.message }
        })
        .eq('id', submission.id);
    });

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
            
            <div class="bg-gray-100 rounded-lg p-6 space-y-6">
              <div>
                <h2 class="text-xl font-semibold mb-4">מידע גולמי מהטופס</h2>
                <pre class="bg-gray-800 text-white p-4 rounded overflow-auto" dir="ltr">
                  ${JSON.stringify(formData, null, 2)}
                </pre>
              </div>

              <div>
                <h2 class="text-xl font-semibold mb-4">תוכן שנשמר ב-DB</h2>
                <pre class="bg-gray-800 text-white p-4 rounded overflow-auto" dir="ltr">
                  ${JSON.stringify(content, null, 2)}
                </pre>
              </div>

              <div>
                <h2 class="text-xl font-semibold mb-4">פרטי ההגשה</h2>
                <pre class="bg-gray-800 text-white p-4 rounded overflow-auto" dir="ltr">
                  ${JSON.stringify(submission, null, 2)}
                </pre>
              </div>
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