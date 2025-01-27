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
      
      if (formData.rawRequest) {
        try {
          formData.parsedRequest = JSON.parse(formData.rawRequest);
        } catch (e) {
          console.error('Failed to parse rawRequest:', e);
          formData.parsedRequest = formData.rawRequest;
        }
      }
    } else if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      const formDataObj = await request.formData();
      formData = Object.fromEntries(formDataObj.entries());
      console.log('Form data after parsing:', formData);
      
      if (formData.rawRequest) {
        try {
          formData.parsedRequest = JSON.parse(formData.rawRequest);
        } catch (e) {
          console.error('Failed to parse rawRequest:', e);
          formData.parsedRequest = formData.rawRequest;
        }
      }
    }

    // Save to database first
    const { data: submission, error: submissionError } = await supabase
      .from('form_submissions')
      .insert({
        form_data: formData,
        status: 'pending',
        submission_id: formData.submissionID || formData.submission_id,
        template_id: formData.templateId || formData.template_id,
      })
      .select()
      .single();

    if (submissionError) {
      console.error('Error saving submission:', submissionError);
      throw submissionError;
    }

    // Start processing in background without waiting
    fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/process?submissionId=${submission.submission_id}`)
      .catch(error => console.error('Failed to trigger processing:', error));

    // Return success immediately
    return NextResponse.json({ 
      message: 'Submission received and processing started',
      submissionId: submission.submission_id
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 