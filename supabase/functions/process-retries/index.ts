/// <reference lib="deno.ns" />
/// <reference types="https://deno.land/x/types/index.d.ts" />
// @deno-types="https://esm.sh/v135/@supabase/supabase-js@2.39.7/dist/module/index.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// הוספת לוגים מפורטים יותר
console.log('Edge Function starting...');

serve(async (req: Request) => {
  try {
    // מוצא submissions שמחכים לretry
    const { data: submissions, error } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('status', 'pending_retry')
      .limit(10);

    if (error) throw error;

    if (!submissions?.length) {
      return new Response(
        JSON.stringify({ message: 'No submissions to retry' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // מעבד כל submission
    const results = await Promise.allSettled(
      submissions.map(async (submission) => {
        try {
          // מעדכן סטטוס לprocessing
          await supabase
            .from('form_submissions')
            .update({
              status: 'processing',
              processing_started_at: new Date().toISOString(),
              logs: [...(submission.logs || []), {
                timestamp: new Date().toISOString(),
                event: 'retry_processing_started',
                retry_count: submission.retry_count
              }]
            })
            .eq('id', submission.id);

          // קורא לprocess endpoint
          const processResponse = await fetch(
            `${Deno.env.get('APP_URL')}/api/process`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                submissionId: submission.submission_id,
                is_retry: true,
                form_id: submission.form_id,
                content: submission.content
              })
            }
          );

          if (!processResponse.ok) {
            throw new Error(`Process request failed: ${processResponse.statusText}`);
          }

          return {
            submission_id: submission.submission_id,
            status: 'retry_started'
          };
        } catch (error) {
          // אם נכשל, מחזיר לpending
          await supabase
            .from('form_submissions')
            .update({
              status: 'pending',
              logs: [...(submission.logs || []), {
                timestamp: new Date().toISOString(),
                event: 'retry_failed',
                error: error instanceof Error ? error.message : 'Unknown error',
                retry_count: submission.retry_count
              }]
            })
            .eq('id', submission.id);

          return {
            submission_id: submission.submission_id,
            status: 'retry_failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );

    return new Response(
      JSON.stringify({
        message: `Processed ${submissions.length} submissions`,
        results
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}); 