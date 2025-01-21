import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from './supabase-admin'

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

async function getPrompts(formId: string) {
  try {
    // קבלת ה-template על פי form_id
    const { data: template, error } = await supabaseAdmin
      .from('templates')
      .select('template_gsheets_id')
      .eq('form_id', formId)
      .single();
    
    if (error) {
      console.error('Error fetching template:', error);
      return ['נא לספק תשובה מפורטת על בסיס המידע שקיבלת'];
    }

    if (!template?.template_gsheets_id) {
      console.error('No Google Sheet ID found for form:', formId);
      return ['נא לספק תשובה מפורטת על בסיס המידע שקיבלת'];
    }

    const API_KEY = process.env.GOOGLE_API_KEY;
    if (!API_KEY) {
      console.error('Missing Google API key');
      return ['נא לספק תשובה מפורטת על בסיס המידע שקיבלת'];
    }
    
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${template.template_gsheets_id}/values/A:A?key=${API_KEY}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.values) {
      console.error('No data returned from Google Sheets:', data);
      return ['נא לספק תשובה מפורטת על בסיס המידע שקיבלת'];
    }
    
    return data.values.map((row: string[]) => row[0]);
  } catch (error) {
    console.error('Error in getPrompts:', error);
    return ['נא לספק תשובה מפורטת על בסיס המידע שקיבלת'];
  }
}

export async function processSubmission(submissionId: string) {
  let submissionUUID: string | null = null;
  
  try {
    console.log('Starting processSubmission with submissionId:', submissionId);
    
    // קבלת הנתונים מ-Supabase
    console.log('Fetching submission from Supabase...');
    const { data: submission, error } = await supabaseAdmin
      .from('form_submissions')
      .select('*')
      .eq('submission_id', submissionId)
      .single();

    if (error) {
      console.error('Error fetching submission:', error);
      throw error;
    }

    if (!submission) {
      console.error('No submission found for ID:', submissionId);
      throw new Error('Submission not found');
    }

    submissionUUID = submission.id;

    console.log('Found submission:', submission);
    console.log('Form data:', submission.content.form_data);

    // המרת התשובות לפורמט הנכון
    const answers = Object.entries(submission.content.form_data)
      .map(([key, value]) => `שאלה: ${key} - תשובה: ${value}`)
      .join('\n');

    console.log('Formatted answers:', answers);

    // קבלת הפרומפטים מגוגל שיטס לפי form_id
    console.log('Getting prompts for form_id:', submission.form_id);
    const prompts = await getPrompts(submission.form_id);
    console.log('Got prompts:', prompts);
    
    // שיחה עם קלוד - הודעה ראשונה
    let messages: Message[] = [{ role: "user", content: answers + '\n' + prompts[0] }]
    let claudeResponses = []
    
    console.log('Sending first message to Claude:', messages[0]);
    let msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 8192,
      messages: messages
    })
    claudeResponses.push(msg)
    console.log('Got first response from Claude:', msg);

    // המשך השיחה עם שאר הפרומפטים
    for (let i = 1; i < prompts.length; i++) {
      const lastResponse = msg.content.find(block => 'text' in block)?.text || ''
      
      messages = [
        ...messages,
        { role: 'assistant' as const, content: lastResponse },
        { role: 'user' as const, content: prompts[i] }
      ]
      
      console.log(`Sending message ${i + 1} to Claude:`, messages[messages.length - 1]);
      msg = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 8192,
        messages: messages
      })
      claudeResponses.push(msg)
      console.log(`Got response ${i + 1} from Claude:`, msg);
    }

    // שמירת התוצאות ב-Supabase
    const lastResponse = msg.content.find(block => 'text' in block)?.text || ''
    
    console.log('Updating submission with results...');
    const { error: updateError } = await supabaseAdmin
      .from('form_submissions')
      .update({
        status: 'completed',
        result: {
          claudeResponses,
          completeChat: [...messages, { role: 'assistant' as const, content: lastResponse }]
        }
      })
      .eq('id', submissionUUID)

    if (updateError) {
      console.error('Error updating submission:', updateError);
      throw updateError;
    }

    console.log('Successfully completed processing');
    return msg;
  } catch (error) {
    console.error('Error in processSubmission:', error)
    
    if (submissionUUID) {
      await supabaseAdmin
        .from('form_submissions')
        .update({
          status: 'error',
          result: { error: error instanceof Error ? error.message : 'Unknown error' }
        })
        .eq('id', submissionUUID)
    }
    throw error
  }
} 