import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processSubmission } from '@/lib/claude';

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
    console.log('💾 Saving to raw_submissions:', {
      headers: Object.fromEntries(request.headers.entries()),
      content_type: contentType,
      formData: formData
    });
    
    const { error: rawError } = await supabase
      .from('raw_submissions')
      .insert({
        headers: Object.fromEntries(request.headers.entries()),
        body: rawBody,
        content_type: contentType,
        parsed_body: formData
      });
      
    if (rawError) {
      console.error('❌ Error saving raw data:', rawError);
    } else {
      console.log('✅ Successfully saved to raw_submissions');
    }

    // Extract form_id from raw data with better logging
    console.log('🔍 Raw formData:', JSON.stringify(formData, null, 2));
    
    const formId = formData.formID || formData.raw?.formID || formData.metadata?.form_id;
    console.log('🔍 Extracted formId:', formId, {
      fromFormID: formData.formID,
      fromRawFormID: formData.raw?.formID,
      fromMetadataFormId: formData.metadata?.form_id
    });
    
    if (!formId) {
      console.error('❌ Missing form_id in request. Data locations checked:', {
        'formData.formID': formData.formID,
        'formData.raw.formID': formData.raw?.formID,
        'formData.metadata.form_id': formData.metadata?.form_id,
        'Full formData': formData
      });
      return new Response(JSON.stringify({ error: 'Missing form_id in request' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Extract submission_id from raw data with better logging
    const submissionId = formData.submissionID || formData.raw?.submissionID || formData.metadata?.submission_id;
    console.log('🔍 Extracted submissionId:', submissionId, {
      fromSubmissionID: formData.submissionID,
      fromRawSubmissionID: formData.raw?.submissionID,
      fromMetadataSubmissionId: formData.metadata?.submission_id
    });
    
    // Prepare the content object with all form fields
    let content;
    try {
      let parsedFields;
      console.log('🔄 Starting to parse fields');
      
      if (formData.parsedRequest) {
        console.log('📄 Using parsedRequest');
        parsedFields = formData.parsedRequest;
      } else if (formData.rawRequest) {
        console.log('📄 Parsing rawRequest');
        try {
          parsedFields = JSON.parse(formData.rawRequest);
        } catch (e) {
          console.error('❌ Failed to parse rawRequest:', e);
          parsedFields = formData.rawRequest;
        }
      } else {
        console.log('📄 Using formData as is');
        parsedFields = formData;
      }

      content = {
        form_data: parsedFields,
        metadata: {
          submission_id: submissionId,
          form_id: formId
        },
        raw: formData
      };
      
      console.log('📦 Prepared content:', JSON.stringify(content, null, 2));
    } catch (e) {
      console.error('❌ Failed to parse content:', e);
      content = formData;
    }

    console.log('📝 Final data before save:', {
      submission_id: submissionId,
      form_id: formId,
      content_size: JSON.stringify(content).length
    });

    // Validation checks
    const validationErrors = [];
    if (!submissionId) validationErrors.push('Missing submission_id');
    if (!formId) validationErrors.push('Missing form_id');
    if (!content) validationErrors.push('Missing content');
    if (!content?.form_data) validationErrors.push('Missing form_data in content');
    if (!content?.metadata) validationErrors.push('Missing metadata in content');

    if (validationErrors.length > 0) {
      console.error('❌ Validation failed:', validationErrors);
      console.error('Full data:', {
        submissionId,
        formId,
        content: JSON.stringify(content, null, 2)
      });
      throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
    }

    // Save to database
    console.log('💾 Attempting to save to form_submissions with data:', {
      submission_id: submissionId,
      form_id: formId,
      content_keys: Object.keys(content || {}),
      status: 'pending'
    });
    const { data: submission, error } = await supabase
      .from('form_submissions')
      .insert({
        submission_id: submissionId,
        form_id: formId,
        content: content || {},
        status: 'pending'
      })
      .select('*')
      .single();

    if (error) {
      console.error('❌ Database error:', error);
      throw error;
    }

    console.log('✅ Successfully saved to form_submissions:', submission);

    // התחל עיבוד מול קלוד באופן אסינכרוני
    console.log('🚀 Starting async processing for submission:', { id: submission.id, submission_id: submission.submission_id });
    
    try {
      // Call the process API
      const origin = request.headers.get('origin') || request.headers.get('host');
      const protocol = origin?.includes('localhost') ? 'http' : 'https';
      const baseUrl = origin ? `${protocol}://${origin}` : process.env.NEXT_PUBLIC_APP_URL;
      
      if (!baseUrl) {
        throw new Error('Could not determine base URL for API call');
      }

      console.log('🌐 Making API call to:', `${baseUrl}/api/process`);
      
      const response = await fetch(`${baseUrl}/api/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ submissionId: submission.submission_id })
      });

      if (!response.ok) {
        throw new Error(`Process API returned ${response.status}: ${await response.text()}`);
      }

      console.log('✅ Successfully triggered processing');
    } catch (error) {
      console.error('❌ Error triggering processing:', error);
      await supabase
        .from('form_submissions')
        .update({
          status: 'error',
          result: { 
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            details: error
          }
        })
        .eq('id', submission.id);
    }

    // Return response page
    return new Response(`
      <!DOCTYPE html>
      <html dir="rtl">
        <head>
          <title>תוצאות הטופס</title>
          <meta charset="utf-8">
          <script src="https://cdn.tailwindcss.com"></script>
          <script>
            window.location.href = '/results?s=${submission.submission_id}';
          </script>
        </head>
        <body>
          <div class="flex items-center justify-center min-h-screen">
            <div class="text-center">
              <div class="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900 mx-auto"></div>
              <p class="mt-4 text-xl">מעבד את הנתונים...</p>
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