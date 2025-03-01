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

type FormattedMessage = {
  role: MessageRole,
  content: Array<{
    type: "text",
    text: string,
    cache_control?: { type: "ephemeral" }
  }> | string
}

// Add at the top with other types
type ClaudeMessage = Anthropic.Messages.Message;

// Add token tracking
let inputTokens = 0;
let outputTokens = 0;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const MAX_RETRIES = 5;
const MAX_TOKENS = 200000;
const RETRY_DELAY = 3000;
const CLAUDE_TIMEOUT = 600000; // 10 minutes

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

async function getPrompts(formId: string, submissionId?: string) {
  try {
    console.log('🔍 Starting getPrompts for formId:', formId);
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout: Failed to fetch prompts after 30 seconds')), 30000);
    });

    const fetchPromptsPromise = (async () => {
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
    })();

    return await Promise.race([fetchPromptsPromise, timeoutPromise]);
  } catch (error) {
    console.error('❌ Error in getPrompts:', error);
    
    // Update submission status to error if it's a timeout and we have submissionId
    if (error instanceof Error && error.message.includes('Timeout') && submissionId) {
      await supabaseAdmin
        .from('form_submissions')
        .update({
          status: 'error',
          progress: {
            stage: 'error',
            message: 'תקלה בקבלת השאלות - התהליך נמשך יותר מדי זמן',
            timestamp: new Date().toISOString()
          },
          result: {
            error: 'Timeout while fetching prompts',
            details: error.message
          }
        })
        .eq('submission_id', submissionId);
    }
    
    throw error;
  }
}

// פונקציה להערכת כדאיות הקאשינג
function estimateCachingCost(
  promptTokens: number, 
  estimatedUsageCount: number = 1, 
  regularRate: number = 3.0, 
  cacheCreateRate: number = 3.75,
  cacheReadRate: number = 0.3
): { 
  withoutCaching: number, 
  withCaching: number, 
  breakEvenPoint: number, 
  saving: number, 
  savingPercentage: number,
  recommendation: string
} {
  // עלות ללא קאשינג
  const withoutCaching = (promptTokens / 1000000) * regularRate * estimatedUsageCount;
  
  // עלות עם קאשינג (יקר בפעם הראשונה, זול בפעמים הבאות)
  const cachingFirstUse = (promptTokens / 1000000) * cacheCreateRate;
  const cachingSubsequentUses = (promptTokens / 1000000) * cacheReadRate * (estimatedUsageCount - 1);
  const withCaching = cachingFirstUse + cachingSubsequentUses;
  
  // נקודת איזון - מספר השימושים שבו הקאשינג מתחיל להשתלם
  const breakEvenPoint = (cacheCreateRate - regularRate) / (regularRate - cacheReadRate);
  
  // חיסכון
  const saving = withoutCaching - withCaching;
  const savingPercentage = (saving / withoutCaching) * 100;
  
  // המלצה
  let recommendation = '';
  if (estimatedUsageCount <= 1) {
    recommendation = 'קאשינג אינו מומלץ לשימוש חד פעמי (יקר יותר ב-25%)';
  } else if (estimatedUsageCount < breakEvenPoint + 1) {
    recommendation = `קאשינג עדיין לא משתלם. צריך לפחות ${Math.ceil(breakEvenPoint + 1)} שימושים להפוך למשתלם.`;
  } else {
    recommendation = `קאשינג משתלם! חיסכון של ${savingPercentage.toFixed(1)}% (${saving.toFixed(3)}$)`;
  }
  
  return {
    withoutCaching,
    withCaching,
    breakEvenPoint,
    saving,
    savingPercentage,
    recommendation
  };
}

// הוספת פונקציה לתחזית כדאיות פרומפטים נוכחיים
function estimateCurrentCachingBenefit(
  messages: Message[], 
  estimatedTemplateUsers: number = 1
): void {
  // חישוב גודל משוער של כל ההיסטוריה (בייתים)
  const fullHistorySize = messages.reduce((total, msg) => total + msg.content.length, 0);
  
  // המרה לטוקנים (הערכה גסה - כ-4 תווים לטוקן)
  const estimatedTokens = Math.ceil(fullHistorySize / 4);
  
  console.log('\n📊 Caching Cost-Benefit Analysis:');
  console.log(`Estimated prompt size: ~${estimatedTokens} tokens`);
  
  // חישוב לפי מספר משתמשים שונים
  [1, 2, 5, 10, 20, 50].forEach(userCount => {
    const estimate = estimateCachingCost(estimatedTokens, userCount);
    console.log(`\nWith ${userCount} similar form submissions:`);
    console.log(`  - Without caching: $${estimate.withoutCaching.toFixed(4)}`);
    console.log(`  - With caching: $${estimate.withCaching.toFixed(4)}`);
    console.log(`  - ${estimate.recommendation}`);
  });
  
  // חישוב לפי המשתמשים הצפויים
  if (estimatedTemplateUsers > 1) {
    const targetEstimate = estimateCachingCost(estimatedTokens, estimatedTemplateUsers);
    console.log(`\n🎯 For your expected ${estimatedTemplateUsers} submissions:`);
    console.log(`  - Estimated saving: $${targetEstimate.saving.toFixed(4)} (${targetEstimate.savingPercentage.toFixed(1)}%)`);
    console.log(`  - ${targetEstimate.recommendation}`);
  }
}

async function callClaude(messages: Message[], submissionId: string): Promise<ClaudeMessage> {
  const timeoutPromise = new Promise<ClaudeMessage>((_, reject) => {
    setTimeout(() => reject(new Error('Timeout: Claude response took longer than 10 minutes')), CLAUDE_TIMEOUT);
  });

  // אם יש יותר מהודעה אחת, נתמוך בקאשינג רק להודעות חוץ מהאחרונה
  let formattedMessages: FormattedMessage[] = [];
  
  if (messages.length > 1) {
    // ההודעה הראשונה (המידע מהטופס + פרומפט ראשון) תמיד תשמר לקאשינג
    formattedMessages.push({
      role: messages[0].role,
      content: [
        {
          type: "text",
          text: messages[0].content,
          cache_control: { type: "ephemeral" }
        }
      ]
    });
    
    // הודעות אמצע - כל זוג של תשובה ופרומפט הבא
    for (let i = 1; i < messages.length - 2; i += 2) {
      if (messages[i] && messages[i + 1]) {
        // תשובת קלוד
        formattedMessages.push({
          role: messages[i].role,
          content: [
            {
              type: "text",
              text: messages[i].content,
              cache_control: { type: "ephemeral" }
            }
          ]
        });
        
        // פרומפט משתמש הבא
        formattedMessages.push({
          role: messages[i + 1].role,
          content: [
            {
              type: "text",
              text: messages[i + 1].content,
              cache_control: { type: "ephemeral" }
            }
          ]
        });
      }
    }
    
    // הוספת ההודעה הלפני אחרונה - אם זו תשובה של קלוד
    if (messages.length > 2 && messages[messages.length - 2].role === "assistant") {
      formattedMessages.push({
        role: "assistant",
        content: [
          {
            type: "text",
            text: messages[messages.length - 2].content,
            cache_control: { type: "ephemeral" }
          }
        ]
      });
    }
    
    // הוספת ההודעה האחרונה ללא קאשינג - תמיד פרומפט משתמש
    formattedMessages.push({
      role: messages[messages.length - 1].role,
      content: [
        {
          type: "text",
          text: messages[messages.length - 1].content
        }
      ]
    });
  } else {
    // רק הודעה אחת, נשתמש בה כפי שהיא ללא קאשינג
    formattedMessages = [
      {
        role: messages[0].role,
        content: [
          {
            type: "text",
            text: messages[0].content
          }
        ]
      }
    ];
  }

  console.log('Formatted messages for Claude:', JSON.stringify(formattedMessages, null, 2));

  const claudePromise = anthropic.messages.create({
    model: "claude-3-7-sonnet-latest",
    messages: formattedMessages as any,
    temperature: 0.7,
    max_tokens: 8192
  });

  try {
    const response = await Promise.race([claudePromise, timeoutPromise]) as Anthropic.Messages.Message;
    // Track tokens separately
    inputTokens += response.usage?.input_tokens || 0;
    outputTokens += response.usage?.output_tokens || 0;
    
    // הוספת מעקב אחרי קאשינג
    if (response.usage?.cache_creation_input_tokens) {
      console.log(`Cache created: ${response.usage.cache_creation_input_tokens} tokens cached`);
    }
    if (response.usage?.cache_read_input_tokens) {
      console.log(`Cache hit: ${response.usage.cache_read_input_tokens} tokens read from cache`);
    }
    
    return response;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Timeout')) {
      await supabaseAdmin
        .from('form_submissions')
        .update({
          status: 'error',
          progress: {
            stage: 'error',
            message: 'תקלה בתקשורת עם קלוד - התהליך נמשך יותר מ-10 דקות',
            timestamp: new Date().toISOString()
          },
          result: {
            error: 'Claude conversation timeout',
            details: error.message
          }
        })
        .eq('submission_id', submissionId);
    }
    throw error;
  }
}

async function addLog(submissionId: string, message: string, data?: any) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    message,
    data
  };
  
  console.log(`${message}:`, data || '');

  await supabaseAdmin.rpc('append_log', { 
    p_submission_id: submissionId,
    p_log: logEntry
  });
}

async function updateProgress(submissionId: string, stage: string, message: string, details?: any, current?: number, total?: number) {
  const timestamp = new Date().toISOString();
  
  // Only update status to 'processing' during the processing stages
  const update: any = {
    progress: {
      stage,
      message,
      details,
      current,
      total,
      timestamp
    }
  };

  // Only set status to 'processing' during active processing stages
  if (['init', 'template', 'prompts', 'claude'].includes(stage)) {
    update.status = 'processing';
  }
  
  await supabaseAdmin
    .from('form_submissions')
    .update(update)
    .eq('submission_id', submissionId);
    
  // Add log
  await supabaseAdmin.rpc('append_log', { 
    p_submission_id: submissionId,
    p_log: {
      stage,
      message,
      details,
      timestamp
    }
  });
}

export async function processSubmission(submissionId: string) {
  let submissionUUID: string | null = null;
  let messages: Message[] = [];
  let msg: ClaudeMessage;
  // מערך נוסף לשמירת התשובות של קלוד (עבור המצב המאוחד)
  let previousResponses: string[] = [];
  let useOptimizedPrompting = false;
  // מעקב אחרי קאשינג
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;
  
  try {
    await updateProgress(submissionId, 'init', 'מתחיל עיבוד', null, 0, 4);
    
    // Verify the update
    const { data: verifyData, error: verifyError } = await supabaseAdmin
      .from('form_submissions')
      .select('status, progress')
      .eq('submission_id', submissionId)
      .single();

    if (verifyError || verifyData?.status !== 'processing') {
      console.error('❌ Status update verification failed:', { verifyError, currentStatus: verifyData?.status });
      throw new Error('Failed to verify status update');
    }

    console.log('✅ Verified status update:', verifyData);

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
    await updateProgress(submissionId, 'template', 'מאתר תבנית', null, 1, 4);

    // Get template
    const { data: template } = await supabaseAdmin
      .from('templates')
      .select('*')
      .eq('form_id', submission.form_id)
      .single();

    // בדיקה האם להשתמש בגישה המאוחדת
    useOptimizedPrompting = template?.use_optimized_prompting || false;
    console.log(`Using ${useOptimizedPrompting ? 'optimized' : 'standard'} prompting mode`);
    
    // אומדן היסטוריית השימוש בתבנית זו
    const { data: usage, error: usageError } = await supabaseAdmin
      .from('form_submissions')
      .select('count')
      .eq('form_id', submission.form_id)
      .eq('status', 'completed');
    
    const estimatedTemplateUses = (usage && !usageError) ? parseInt(usage.count) + 1 : 1;
    console.log(`Estimated template usage history: ${estimatedTemplateUses} submissions`);
    
    // בדיקת כדאיות הקאשינג לתבנית זו (רק לצורך לוג)
    // הערכה ראשונית בהתבסס על גודל ממוצע של פרומפט
    const averagePromptTokens = 2500; // הערכה גסה
    const cachingEstimate = estimateCachingCost(averagePromptTokens, estimatedTemplateUses);
    console.log(`\n💰 Caching cost-benefit estimation for this template:`);
    console.log(`  - Estimated submissions: ${estimatedTemplateUses}`);
    console.log(`  - Without caching: $${cachingEstimate.withoutCaching.toFixed(4)}`);
    console.log(`  - With caching: $${cachingEstimate.withCaching.toFixed(4)}`);
    console.log(`  - ${cachingEstimate.recommendation}`);
    
    if (estimatedTemplateUses > 1) {
      const savingMessage = `Caching will save approximately ${cachingEstimate.savingPercentage.toFixed(1)}% (${cachingEstimate.saving.toFixed(4)}$) on this template`;
      console.log(`  - ${savingMessage}`);
      
      // נשמור את ההערכה בלוג
      await addLog(submissionId, 'Caching benefit estimation', {
        estimatedTemplateUses,
        withoutCaching: cachingEstimate.withoutCaching,
        withCaching: cachingEstimate.withCaching,
        saving: cachingEstimate.saving,
        savingPercentage: cachingEstimate.savingPercentage,
        recommendation: cachingEstimate.recommendation
      });
    }

    // Update progress - fetching prompts
    await updateProgress(submissionId, 'prompts', 'מכין שאלות', null, 2, 4);

    console.log('🔄 About to fetch prompts for form_id:', submission.form_id);
    
    // Get prompts with validation
    const prompts = await getPrompts(submission.form_id, submissionId);
    
    if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
      throw new Error('Failed to get valid prompts array');
    }
    
    console.log('📝 Received prompts:', {
      count: prompts.length,
      firstPrompt: prompts[0],
      timestamp: new Date().toISOString()
    });

    // Update progress - starting Claude
    await updateProgress(submissionId, 'claude', 'שולח הודעה ראשונה לקלוד', null);

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

    // Debug logging
    console.log('Raw submission content:', submission.content);
    console.log('Form data path:', submission.content?.form_data);

    // Ensure form_data exists and is an object
    let formData: Record<string, any> = {};
    try {
      if (typeof submission.content?.form_data === 'object' && submission.content.form_data !== null) {
        formData = submission.content.form_data;
      } else if (typeof submission.content === 'object' && submission.content !== null) {
        formData = submission.content;
      }
      
      // סינון השדה rawRequest מהנתונים שנשלחים לקלוד
      if ('rawRequest' in formData) {
        console.log('Removing rawRequest field before sending to Claude');
        delete formData.rawRequest;
      }
      
      // סינון גם את parsedRequest שנוצר מ-rawRequest
      if ('parsedRequest' in formData) {
        console.log('Removing parsedRequest field before sending to Claude');
        delete formData.parsedRequest;
      }
      
    } catch (error) {
      console.error('Error processing form data:', error);
      console.log('Using empty form data object as fallback');
    }
    
    console.log('Processed form data:', formData);
    
    let answers;
    // אם יש שדה pretty, נשתמש רק בו
    if (formData.pretty) {
      console.log('Using only pretty field for Claude input');
      answers = formData.pretty;
    } else {
      // אחרת נשתמש בכל השדות כמו קודם
      console.log('No pretty field found, using all form fields');
      answers = Object.entries(formData)
        .filter(([key]) => !technicalFields.includes(key))
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
    }

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
    msg = await retryWithExponentialBackoff(async () => {
      await updateProgress(
        submissionId, 
        'claude', 
        'שולח הודעה ראשונה לקלוד',
        { initialMessage }
      );
      
      return await callClaude(messages, submissionId);
    });

    const firstResponse = msg.content.find(block => 'text' in block)?.text || '';
    
    // עדכון מעקב אחרי קאשינג
    if (msg.usage?.cache_creation_input_tokens) {
      totalCacheCreationTokens += msg.usage.cache_creation_input_tokens;
    }
    if (msg.usage?.cache_read_input_tokens) {
      totalCacheReadTokens += msg.usage.cache_read_input_tokens;
    }
    
    await updateProgress(
      submissionId, 
      'claude', 
      'התקבלה תשובה ראשונה מקלוד',
      { firstResponse }
    );
    
    claudeResponses.push(msg);
    
    // שמירת התשובה במערך התשובות הקודמות (למצב המאוחד)
    previousResponses.push(firstResponse);

    // Process remaining prompts with validation
    for (let i = 1; i < prompts.length; i++) {
      if (!prompts[i]) {
        console.warn(`Skipping undefined prompt at index ${i}`);
        continue;
      }

      await updateProgress(
        submissionId, 
        'claude', 
        `מעבד שאלה ${i + 1} מתוך ${prompts.length}`,
        {
          currentPrompt: prompts[i],
          lastResponse: msg.content.find(block => 'text' in block)?.text || ''
        },
        i + 1,
        prompts.length
      );

      console.log(`\n🔄 Processing prompt ${i + 1}/${prompts.length}`);
      
      const lastResponse = msg.content.find(block => 'text' in block)?.text || '';
      console.log('📊 Current conversation state:', messages);
      console.log('📤 Next prompt:', prompts[i]);
      
      const isLastPrompt = i === prompts.length - 1;

      // בדיקה אם להשתמש בגישה המאוחדת ולאתחל את ההיסטוריה
      if (useOptimizedPrompting) {
        // במצב האופטימלי, אנחנו בונים את ההודעה בצורה שונה לפרומפט האחרון
        if (isLastPrompt) {
          // בפרומפט האחרון, אנחנו מעבירים את כל התשובות הקודמות יחד
          let finalPromptContent = "מידע מהטופס:\n" + answers + "\n\n";
          
          // הוספת כל התשובות הקודמות
          previousResponses.forEach((response, index) => {
            finalPromptContent += `תשובה לפרומפט ${index + 1}:\n${response}\n\n`;
          });
          
          // הוספת הפרומפט האחרון
          finalPromptContent += "פרומפט אחרון:\n" + prompts[i];
          
          // איפוס רשימת ההודעות ושליחה של ההודעה המאוחדת
          messages = [{ role: "user", content: finalPromptContent }];
          console.log('📤 Sending final consolidated prompt to Claude');
        } else {
          // אם לא מדובר בפרומפט האחרון, שלח רק את הפלט מהטופס והפרומפט הנוכחי
          messages = [{ role: "user", content: answers + '\n' + prompts[i] }];
          console.log('📤 Sending isolated prompt to Claude (optimized mode)');
        }
      } else {
        // במצב הרגיל, המשך כרגיל ושמור את כל היסטוריית השיחה
        messages.push(
          { role: 'assistant', content: lastResponse },
          { role: 'user', content: prompts[i] }
        );
        console.log('📨 Sending full conversation to Claude (standard mode with caching)');
      }

      // Claude call with retry
      msg = await retryWithExponentialBackoff(async () => {
        return await callClaude(messages, submissionId);
      });

      const response = msg.content.find(block => 'text' in block)?.text || '';
      
      // עדכון מעקב אחרי קאשינג
      if (msg.usage?.cache_creation_input_tokens) {
        totalCacheCreationTokens += msg.usage.cache_creation_input_tokens;
        console.log(`🔄 Cache created: ${msg.usage.cache_creation_input_tokens} tokens cached`);
      }
      if (msg.usage?.cache_read_input_tokens) {
        totalCacheReadTokens += msg.usage.cache_read_input_tokens;
        console.log(`✅ Cache hit: ${msg.usage.cache_read_input_tokens} tokens read from cache`);
      }
      
      console.log('📥 Claude response:', {
        role: 'assistant',
        content: response
      });
      
      claudeResponses.push(msg);
      
      // שמירת התשובה במערך התשובות הקודמות (למצב המאוחד)
      if (!isLastPrompt) {
        previousResponses.push(response);
      }
      
      // מידע על צריכת טוקנים
      const regularInputTokens = msg.usage?.input_tokens || 0;
      const outputTokenUsage = msg.usage?.output_tokens || 0;
      const cacheCreationTokens = msg.usage?.cache_creation_input_tokens || 0;
      const cacheReadTokens = msg.usage?.cache_read_input_tokens || 0;
      
      console.log('📈 Token usage for this prompt:');
      console.log(`   - Regular input tokens: ${regularInputTokens}`);
      console.log(`   - Output tokens: ${outputTokenUsage}`);
      console.log(`   - Cache creation tokens: ${cacheCreationTokens}`);
      console.log(`   - Cache read tokens: ${cacheReadTokens}`);
      console.log(`   - Total for this turn: ${regularInputTokens + outputTokenUsage + cacheCreationTokens}`);
      console.log(`   - Cached content: ${cacheReadTokens > 0 ? `${cacheReadTokens} tokens (saved)` : 'None'}`);
      console.log(`📊 Total tokens used so far: ${inputTokens + outputTokens}`);
    }

    // Final response
    const lastResponse = msg.content.find(block => 'text' in block)?.text || '';
    console.log('\n✨ Final conversation summary:');
    console.log('Total messages:', messages.length);
    console.log('Total tokens:', inputTokens + outputTokens);
    console.log('Total cache creation tokens:', totalCacheCreationTokens);
    console.log('Total cache read tokens:', totalCacheReadTokens);
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
    
    // כעת נחשב את החיסכון בפועל מהקאשינג
    let cachingSavings = null;
    if (totalCacheReadTokens > 0) {
      // חיסכון בעלות: טוקנים שנקראו מהקאש (במחיר הנמוך) לעומת עלות רגילה
      const regularCost = (totalCacheReadTokens / 1000000) * 3.0; // $3 למיליון טוקנים
      const cacheCost = (totalCacheReadTokens / 1000000) * 0.3;   // $0.3 למיליון טוקנים
      const costSaving = regularCost - cacheCost;
      const savingPercentage = (costSaving / regularCost) * 100;
      
      // חיסכון במספר הטוקנים שנשלחו לAPI
      const totalSentTokens = inputTokens - totalCacheReadTokens + totalCacheCreationTokens;
      const tokenSavingPercentage = (totalCacheReadTokens / inputTokens) * 100;
      
      cachingSavings = {
        tokensSaved: totalCacheReadTokens,
        tokensSavedPercentage: tokenSavingPercentage,
        costRegular: regularCost,
        costWithCache: cacheCost,
        moneySaved: costSaving,
        moneySavedPercentage: savingPercentage,
        // אם העלות הנוספת של יצירת הקאש גדולה מהחיסכון בקריאה ממנו
        overallCost: regularCost - cacheCost + (totalCacheCreationTokens / 1000000) * (3.75 - 3.0)
      };
      
      console.log('\n💰 Caching Savings Analysis:');
      console.log(`  - Tokens read from cache: ${totalCacheReadTokens} (${tokenSavingPercentage.toFixed(1)}% of input tokens)`);
      console.log(`  - Cost without caching: $${regularCost.toFixed(4)}`);
      console.log(`  - Cost with caching: $${cacheCost.toFixed(4)}`);
      console.log(`  - Money saved: $${costSaving.toFixed(4)} (${savingPercentage.toFixed(1)}%)`);
      console.log(`  - Extra cost for cache creation: $${((totalCacheCreationTokens / 1000000) * (3.75 - 3.0)).toFixed(4)}`);
      
      // האם היה שווה להשתמש בקאשינג?
      const netSaving = costSaving - ((totalCacheCreationTokens / 1000000) * (3.75 - 3.0));
      if (netSaving > 0) {
        console.log(`  - 🟢 Net saving: $${netSaving.toFixed(4)} - Caching was beneficial!`);
      } else {
        console.log(`  - 🔴 Net cost: $${-netSaving.toFixed(4)} - Caching was more expensive this time.`);
      }
    }

    // Update final status to completed regardless of what happens next
    const result = {
      finalResponse: lastResponse,
      tokenCount: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
        cacheCreation: totalCacheCreationTokens,
        cacheRead: totalCacheReadTokens
      },
      promptingMode: useOptimizedPrompting ? 'optimized' : 'standard',
      cachingEnabled: true,
      previousResponses: previousResponses,
      cachingSavings  // הוספת מידע על החיסכון
    };

    await supabaseAdmin
      .from('form_submissions')
      .update({
        status: 'completed',
        result: result,
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
        }
      })
      .eq('submission_id', submissionId);

    throw error;
  }
} 