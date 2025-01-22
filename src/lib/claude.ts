import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from './supabase-admin'
import { marked } from 'marked'

type Database = {
  public: {
    Tables: {
      form_submissions: {
        Row: {
          id: string;
          submission_id: string;
          status: string;
          form_id: string;
          content: any;
          result: any;
          created_at?: string;
          updated_at?: string;
        };
        Insert: {
          submission_id: string;
          status?: string;
          form_id: string;
          content?: any;
          result?: any;
        };
        Update: {
          submission_id?: string;
          status?: string;
          form_id?: string;
          content?: any;
          result?: any;
        };
      }
    }
  }
}

// יצירת חיבור server-side ל-Supabase
function getSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type MessageRole = "user" | "assistant"
type Message = {
  role: MessageRole
  content: string
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const MAX_RETRIES = 5;
const MAX_TOKENS = 8192;
const RETRY_DELAY = 3000; // 1 second

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithExponentialBackoff<T>(
  operation: () => Promise<T>,
  retries = MAX_RETRIES,
  delayMs = RETRY_DELAY
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retries === 0) throw error;
    await delay(delayMs);
    return retryWithExponentialBackoff(operation, retries - 1, delayMs * 2);
  }
}

// Estimate tokens in a string (rough approximation)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4); // Rough estimate: ~4 chars per token
}

async function getPrompts(formId: string) {
  try {
    console.log('🔍 Starting getPrompts for formId:', formId);
    
    // Fetch template with retry
    const { data: template, error } = await retryWithExponentialBackoff(async () => {
      return await supabaseAdmin
        .from('templates')
        .select('template_gsheets_id, name')
        .eq('form_id', formId)
        .single();
    });
    
    console.log('📋 Template query result:', { 
      template: template ? { 
        name: template.name,
        has_sheets_id: !!template.template_gsheets_id 
      } : null, 
      error 
    });

    if (error) {
      console.error('❌ Error fetching template:', error);
      return ['נא לספק תשובה מפורטת על בסיס המידע שקיבלת'];
    }

    if (!template?.template_gsheets_id) {
      console.error('❌ No Google Sheet ID found for form:', formId);
      return ['נא לספק תשובה מפורטת על בסיס המידע שקיבלת'];
    }

    const API_KEY = process.env.GOOGLE_API_KEY;
    console.log('🔑 Google API Key:', API_KEY ? 'Set' : 'Missing');
    
    if (!API_KEY) {
      console.error('❌ Missing Google API key');
      return ['נא לספק תשובה מפורטת על בסיס המידע שקיבלת'];
    }
    
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${template.template_gsheets_id}/values/A:A?key=${API_KEY}`;
    console.log('🌐 Fetching from Google Sheets:', url.replace(API_KEY, '***'));
    
    // Add retry for Google Sheets API call
    const response = await retryWithExponentialBackoff(async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Google Sheets API error: ${res.status}`);
      return res;
    });
    
    const data = await response.json();
    console.log('📥 Google Sheets response:', {
      hasValues: !!data.values,
      numRows: data.values?.length || 0
    });
    
    if (!data.values) {
      console.error('❌ No data returned from Google Sheets:', data);
      return ['נא לספק תשובה מפורטת על בסיס המידע שקיבלת'];
    }
    
    const prompts = data.values.map((row: string[]) => row[0]);
    console.log('✅ Extracted prompts:', prompts.length, 'prompts found');
    return prompts;
  } catch (error) {
    console.error('❌ Error in getPrompts:', error);
    throw new Error(`Failed to fetch prompts: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function processSubmission(submissionId: string) {
  let submissionUUID: string | null = null;
  let messages: Message[] = [];
  let totalTokens = 0;
  
  try {
    console.log('🚀 processSubmission started', {
      submissionId,
      timestamp: new Date().toISOString()
    });
    
    // Update status to processing with initial progress
    await supabaseAdmin
      .from('form_submissions')
      .update({
        status: 'processing',
        progress: {
          stage: 'init',
          message: 'מתחיל עיבוד',
          current: 0,
          total: 4, // init, template, prompts, claude
          timestamp: new Date().toISOString()
        }
      })
      .eq('submission_id', submissionId);

    // Fetch submission with retry
    const { data: submission, error } = await retryWithExponentialBackoff(async () => {
      return await supabaseAdmin
        .from('form_submissions')
        .select('*')
        .eq('submission_id', submissionId)
        .single();
    });

    if (error) {
      throw error;
    }

    submissionUUID = submission.id;
    
    // Update progress - fetching template
    await supabaseAdmin
      .from('form_submissions')
      .update({
        progress: {
          stage: 'template',
          message: 'מאתר תבנית',
          current: 1,
          total: 4,
          timestamp: new Date().toISOString()
        }
      })
      .eq('submission_id', submissionId);

    // Get template
    const { data: template } = await supabaseAdmin
      .from('templates')
      .select('*')
      .eq('form_id', submission.form_id)
      .single();

    // Update progress - fetching prompts
    await supabaseAdmin
      .from('form_submissions')
      .update({
        progress: {
          stage: 'prompts',
          message: 'מכין שאלות',
          current: 2,
          total: 4,
          timestamp: new Date().toISOString()
        }
      })
      .eq('submission_id', submissionId);

    console.log('🔄 About to fetch prompts for form_id:', submission.form_id);
    
    // Get prompts
    const prompts = await getPrompts(submission.form_id);
    
    console.log('📝 Received prompts:', {
      count: prompts.length,
      firstPrompt: prompts[0],
      timestamp: new Date().toISOString()
    });

    // Update progress - starting Claude
    await supabaseAdmin
      .from('form_submissions')
      .update({
        progress: {
          stage: 'claude',
          message: 'מתחיל שיחה עם קלוד',
          timestamp: new Date().toISOString()
        }
      })
      .eq('submission_id', submissionId);

    // המרת התשובות לפורמט הנכון
    const technicalFields = [
      'path',
      'slug',
      'event_id',
      'buildDate',
      'submitSource',
      'timeToSubmit',
      'eventObserver',
      'uploadServerUrl',
      'jsExecutionTracker',
      'validatedNewRequiredFieldIDs'
    ];

    const answers = Object.entries(submission.content.form_data)
      .filter(([key]) => !technicalFields.includes(key))
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    console.log('Formatted answers:', answers);

    // Initial message setup
    const initialMessage = answers + '\n' + prompts[0];
    console.log('\n🤖 Starting Claude conversation');
    console.log('📤 Initial message to Claude:', {
      role: 'user',
      content: initialMessage
    });
    
    messages = [{ role: "user", content: initialMessage }];
    let claudeResponses = [];

    // First Claude call with retry
    let msg = await retryWithExponentialBackoff(async () => {
      return await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: MAX_TOKENS,
        messages: messages
      });
    });

    const firstResponse = msg.content.find(block => 'text' in block)?.text || '';
    console.log('📥 Claude response:', {
      role: 'assistant',
      content: firstResponse
    });
    
    claudeResponses.push(msg);
    totalTokens += estimateTokens(firstResponse);

    // Process remaining prompts
    for (let i = 1; i < prompts.length; i++) {
      await supabaseAdmin
        .from('form_submissions')
        .update({
          progress: {
            stage: 'claude',
            message: `מעבד שאלה ${i + 1} מתוך ${prompts.length}`,
            current: i + 1,
            total: prompts.length,
            timestamp: new Date().toISOString()
          }
        })
        .eq('submission_id', submissionId);

      console.log(`\n🔄 Processing prompt ${i + 1}/${prompts.length}`);
      
      const lastResponse = msg.content.find(block => 'text' in block)?.text || '';
      console.log('📊 Current conversation state:', messages);
      console.log('📤 Next prompt:', prompts[i]);
      
      messages.push(
        { role: 'assistant', content: lastResponse },
        { role: 'user', content: prompts[i] }
      );
      totalTokens += estimateTokens(prompts[i]);

      console.log('📨 Sending full conversation to Claude:', messages);

      // Claude call with retry
      msg = await retryWithExponentialBackoff(async () => {
        return await anthropic.messages.create({
          model: "claude-3-5-sonnet-20240620",
          max_tokens: MAX_TOKENS,
          messages: messages
        });
      });

      const response = msg.content.find(block => 'text' in block)?.text || '';
      console.log('📥 Claude response:', {
        role: 'assistant',
        content: response
      });
      
      claudeResponses.push(msg);
      totalTokens += estimateTokens(response);
      console.log('📈 Total tokens used:', totalTokens);
    }

    // Final response
    const lastResponse = msg.content.find(block => 'text' in block)?.text || '';
    console.log('\n✨ Final conversation summary:');
    console.log('Total messages:', messages.length);
    console.log('Total tokens:', totalTokens);
    console.log('Final response:', lastResponse);

    // Validate markdown in responses
    const isValidMarkdown = (text: string) => {
      try {
        marked.parse(text);
        return true;
      } catch {
        return false;
      }
    };

    if (!isValidMarkdown(lastResponse)) {
      console.warn('⚠️ Invalid markdown detected in Claude response');
    }

    // Update final status
    const result = {
      finalResponse: lastResponse,
      tokenCount: totalTokens
    };

    await supabaseAdmin
      .from('form_submissions')
      .update({
        status: 'completed',
        result,
        progress: {
          stage: 'completed',
          message: 'העיבוד הושלם',
          timestamp: new Date().toISOString()
        }
      })
      .eq('submission_id', submissionId);

    return result;
  } catch (error) {
    console.error('Error in processSubmission:', error);
    
    await supabaseAdmin
      .from('form_submissions')
      .update({
        status: 'error',
        progress: {
          stage: 'error',
          message: error instanceof Error ? error.message : 'שגיאה לא ידועה',
          timestamp: new Date().toISOString()
        },
        result: { 
          error: error instanceof Error ? error.message : 'Unknown error',
          details: error
        }
      })
      .eq('submission_id', submissionId);

    throw error;
  }
} 