import { createClient } from "@supabase/supabase-js";
import { serve } from "http/server";
console.log('🔄 Process-retries function loaded');
const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
// הוספת לוגים מפורטים יותר
console.log('Edge Function starting...');
serve(async (req)=>{
  console.log('📥 Received request:', {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries())
  });
  try {
    const appUrl = Deno.env.get('APP_URL');
    console.log('🚀 Edge Function starting with APP_URL:', appUrl);
    // מוצא submissions שמחכים לretry או תקועים בפנדינג פרוססינג
    console.log('🔍 Fetching pending_retry and stuck pending_processing submissions...');
    const { data: submissions, error } = await supabase
      .from('form_submissions')
      .select('*')
      .or('status.eq.pending_retry,status.eq.pending_processing')
      .limit(10);
    if (error) {
      console.error('❌ Error fetching submissions:', error);
      throw error;
    }
    if (!submissions?.length) {
      console.log('ℹ️ No submissions found for retry');
      return new Response(JSON.stringify({
        message: 'No submissions to retry'
      }), {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    // Return immediately with acknowledgment
    const response = new Response(JSON.stringify({
      message: `Started processing ${submissions.length} submissions`,
      submission_ids: submissions.map((s)=>s.submission_id),
      statuses: submissions.map((s) => s.status)
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    // Process submissions in the background
    (async ()=>{
      console.log(`📝 Processing ${submissions.length} submissions in background`);
      const results = await Promise.allSettled(submissions.map(async (submission)=>{
        console.log(`\n🔄 Processing submission ${submission.submission_id}:`, {
          form_id: submission.form_id,
          retry_count: submission.retry_count,
          status: submission.status
        });
        try {
          console.log(`📤 Sending to process endpoint: ${appUrl}/api/process`);
          const processResponse = await fetch(`${appUrl}/api/process`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              submissionId: submission.submission_id,
              is_retry: true,
              form_id: submission.form_id,
              content: submission.content
            })
          });
          if (!processResponse.ok) {
            const errorText = await processResponse.text();
            console.error(`❌ Process request failed for ${submission.submission_id}:`, {
              status: processResponse.status,
              statusText: processResponse.statusText,
              error: errorText
            });
            throw new Error(`Process request failed: ${processResponse.statusText} - ${errorText}`);
          }
          console.log(`✅ Successfully processed submission ${submission.submission_id}`);
          return {
            submission_id: submission.submission_id,
            status: 'retry_started',
            original_status: submission.status
          };
        } catch (error) {
          console.error(`❌ Error processing submission ${submission.submission_id}:`, error);
          // אם נכשל, מחזיר לpending
          console.log(`⚠️ Updating submission ${submission.submission_id} back to pending`);
          await supabase.from('form_submissions').update({
            status: 'pending',
            logs: [
              ...(submission.logs || []),
              {
                timestamp: new Date().toISOString(),
                event: 'retry_failed',
                error: error instanceof Error ? error.message : 'Unknown error',
                retry_count: submission.retry_count,
                previous_status: submission.status
              }
            ]
          }).eq('id', submission.id);
          return {
            submission_id: submission.submission_id,
            status: 'retry_failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            original_status: submission.status
          };
        }
      }));
      console.log('🏁 Background processing completed:', results);
    })();
    return response;
  } catch (error) {
    console.error('💥 Fatal error in edge function:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
});
