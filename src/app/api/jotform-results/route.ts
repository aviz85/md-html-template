import { NextResponse } from 'next/server';
import { processSubmission } from '@/lib/claude';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Add type for form data
interface FormData {
  formID?: string;
  submissionID?: string;
  submission_id?: string;
  parsedRequest?: any;
  pretty?: string;
  transcriptions?: Array<{
    fieldName: string;
    path: string;
    questionLabel?: string;
    transcription: string;
  }>;
  transcription_errors?: Array<{
    fieldName: string;
    path: string;
    error: string;
  }>;
  [key: string]: any;
}

// Add interface for new form format
interface NewFormFormat {
  form: {
    id: string;
    name: string;
  };
  fields: {
    [key: string]: {
      id: string;
      type: string;
      title: string;
      value: string;
      raw_value: string | string[];
      required: string;
    };
  };
  meta: {
    [key: string]: {
      title: string;
      value: string;
    };
  };
}

// Converter function for Elementor form format
function convertNewFormFormat(data: NewFormFormat | NewFormFormat[]): FormData {
  // Handle both array and single object format
  const formItem: NewFormFormat = Array.isArray(data) ? data[0] : data;
  
  console.log('[Elementor Converter] Starting conversion process');
  console.log('[Elementor Converter] Input format:', Array.isArray(data) ? 'Array' : 'Object');
  console.log('[Elementor Converter] Form data:', {
    id: formItem.form.id,
    name: formItem.form.name,
    fieldCount: Object.keys(formItem.fields).length,
    metaCount: Object.keys(formItem.meta).length
  });
  
  if (!formItem || !formItem.form || !formItem.fields) {
    console.error('[Elementor Converter] Invalid format - missing required properties');
    throw new Error('Invalid Elementor form data: Missing required structure');
  }
  
  // Validate and extract formID
  const formID = formItem.form.id;
  if (!formID) {
    console.error('[Elementor Converter] Missing form ID in the input data');
    throw new Error('Missing form ID in Elementor form data');
  }
  
  // Ensure formID is a string and log its length for debugging
  const formIDStr = String(formID);
  console.log(`[Elementor Converter] Extracted form ID: ${formIDStr} (${formIDStr.length} characters)`);
  
  // Create submission ID with the same format as existing system: formID_timestamp
  const timestamp = Date.now();
  const submissionID = `${formIDStr}_${timestamp}`;
  
  console.log(`[Elementor Converter] Generated submission ID: ${submissionID} (${submissionID.length} characters)`);
  
  // Create basic FormData structure
  const formData: FormData = {
    formID: formIDStr,
    submissionID: submissionID,
    submission_id: submissionID, // Use the same value for both fields for consistency
    parsedRequest: formItem,
    formProvider: 'elementor' // Mark this as an Elementor form
  };
  
  console.log('[Elementor Converter] Created base FormData structure:', {
    formID: formData.formID,
    submissionID: formData.submissionID,
    formProvider: formData.formProvider
  });
  
  // Generate pretty field as comma-separated "title:value" pairs, similar to JotForm
  const prettyPairs: string[] = [];
  let fieldCounter = 0;
  
  console.log('[Elementor Converter] Processing fields:');
  Object.entries(formItem.fields).forEach(([key, field]) => {
    if (field.title && field.value && field.type !== 'step') {
      prettyPairs.push(`${field.title}:${field.value}`);
      fieldCounter++;
      
      console.log(`[Elementor Converter] Field ${fieldCounter}:`, {
        id: key,
        type: field.type,
        title: field.title,
        value: typeof field.value === 'string' && field.value.length > 100 
          ? `${field.value.substring(0, 100)}... (${field.value.length} chars)` 
          : field.value,
        required: field.required === '1' ? 'Yes' : 'No'
      });
    } else if (field.type === 'step') {
      console.log(`[Elementor Converter] Skipping step field: ${key}`);
    } else if (!field.value) {
      console.log(`[Elementor Converter] Skipping empty field: ${key}, title: ${field.title}`);
    }
  });
  
  // Add metadata fields to pretty
  console.log('[Elementor Converter] Processing metadata:');
  Object.entries(formItem.meta).forEach(([key, meta]) => {
    if (meta.title && meta.value) {
      prettyPairs.push(`${meta.title}:${meta.value}`);
      console.log(`[Elementor Converter] Meta field:`, {
        key,
        title: meta.title,
        value: meta.value
      });
    }
  });
  
  formData.pretty = prettyPairs.join(', ');
  console.log(`[Elementor Converter] Generated pretty field with ${prettyPairs.length} entries`);
  console.log(`[Elementor Converter] Pretty field preview: ${formData.pretty.length > 200 ? formData.pretty.substring(0, 200) + '...' : formData.pretty}`);
  
  // Add raw form item to formData for compatibility with existing code
  formData.rawRequest = JSON.stringify(formItem);
  console.log(`[Elementor Converter] Added rawRequest (${formData.rawRequest.length} chars)`);
  
  // Copy field values to top level for compatibility
  console.log('[Elementor Converter] Creating field mappings:');
  const fieldMappings: Record<string, string> = {};
  
  Object.entries(formItem.fields).forEach(([key, field]) => {
    if (field.type !== 'step' && field.value) {
      // Use the field's title and value consistently
      const sanitizedTitle = field.title.replace(/\s+/g, '_').toLowerCase();
      const fieldKey = key.match(/^field_[a-z0-9]+$/) ? sanitizedTitle : key;
      
      formData[fieldKey] = field.value;
      fieldMappings[fieldKey] = `From field title: ${field.title}`;
      
      // Also keep the original field ID as a key
      formData[key] = field.value;
      fieldMappings[key] = `Original field ID`;
      
      // Add q-prefixed fields for compatibility with JotForm format
      if (!key.startsWith('q')) {
        formData[`q${key}`] = field.value;
        fieldMappings[`q${key}`] = `JotForm compatibility: q-prefixed`;
      }
    }
  });
  
  console.log('[Elementor Converter] Field mappings created:', fieldMappings);
  console.log(`[Elementor Converter] Conversion complete. Final FormData has ${Object.keys(formData).length} properties`);
  
  return formData;
}

// Utility function to convert a JSON string in the new format to FormData
function convertNewFormFormatFromJsonString(jsonString: string): FormData {
  console.log('[Elementor Converter] Starting JSON string conversion');
  console.log(`[Elementor Converter] Input JSON length: ${jsonString.length} characters`);
  console.log(`[Elementor Converter] Input JSON preview: ${jsonString.length > 200 ? jsonString.substring(0, 200) + '...' : jsonString}`);
  
  try {
    const data = JSON.parse(jsonString);
    console.log('[Elementor Converter] Successfully parsed JSON string');
    
    // Check if this is an array or a single object with the expected structure
    if (Array.isArray(data) && data.length > 0 && data[0].form && data[0].fields && data[0].meta) {
      console.log('[Elementor Converter] Detected Elementor form data as array with', data.length, 'items');
      console.log('[Elementor Converter] Using first item with form ID:', data[0].form.id);
      return convertNewFormFormat(data[0]);
    } else if (data.form && data.fields && data.meta) {
      console.log('[Elementor Converter] Detected Elementor form data as single object');
      console.log('[Elementor Converter] Form ID:', data.form.id);
      return convertNewFormFormat(data);
    } else {
      console.error('[Elementor Converter] Invalid structure detected:', {
        isArray: Array.isArray(data),
        hasForm: data.form ? 'Yes' : 'No',
        hasFields: data.fields ? 'Yes' : 'No',
        hasMeta: data.meta ? 'Yes' : 'No',
        topLevelKeys: Array.isArray(data) ? 'N/A' : Object.keys(data)
      });
      throw new Error('Invalid Elementor form format structure');
    }
  } catch (error) {
    console.error('[Elementor Converter] Error during JSON conversion:', error);
    throw new Error(`Failed to convert Elementor form format: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Add interface at the top with other interfaces
interface AudioFile {
  path: string;
  fieldName: string;
  questionLabel?: string;
}

// Helper to find audio files in form data
function findAudioFiles(obj: any): AudioFile[] {
  const audioFiles: AudioFile[] = [];
  
  // Extract question labels from pretty field
  const questionMap = new Map<string, string>();
  if (obj.pretty) {
    const pairs = obj.pretty.split(', ');
    pairs.forEach((pair: string) => {
      const [question, value] = pair.split(':');
      if (value && (value.includes('/widget-uploads/voiceRecorder/') || value.includes('.mp3'))) {
        questionMap.set(value, question);
      }
    });
  }
  
  function traverse(current: any, path: string[] = []) {
    if (typeof current === 'string') {
      // Check for voice recorder widget uploads and add prefix if needed
      if (current.includes('/widget-uploads/voiceRecorder/')) {
        const fullPath = current.startsWith('/') ? 
          `https://www.jotform.com${current}` : 
          `https://www.jotform.com/${current}`;
        
        audioFiles.push({ 
          path: fullPath,
          fieldName: path.join('.'),
          questionLabel: questionMap.get(current)
        });
      }
      // Check for regular mp3 uploads
      else if (current.includes('.mp3') || current.includes('.mp4') || current.includes('.wav')) {
        // If it's already a full URL, use it as is
        const fullPath = current.startsWith('http') ? 
          current : 
          `https://www.jotform.com/${current.startsWith('/') ? current.slice(1) : current}`;
        
        audioFiles.push({
          path: fullPath,
          fieldName: path.join('.'),
          questionLabel: questionMap.get(current)
        });
      }
    } else if (typeof current === 'object' && current !== null) {
      Object.entries(current).forEach(([key, value]) => {
        traverse(value, [...path, key]);
      });
    }
  }

  traverse(obj);
  
  // Log found audio files with their full paths
  console.log('[Audio Files] Found files:', audioFiles.map(f => ({
    ...f,
    originalPath: f.path,
    hasPrefix: f.path.startsWith('https://www.jotform.com')
  })));

  return audioFiles;
}

// Helper to transcribe audio and wait for completion
async function transcribeAudio(audioUrl: string): Promise<string> {
  console.log(`[Transcription] Starting transcription for: ${audioUrl}`);
  
  // Call edge function with the URL directly
  console.log('[Transcription] Calling process-tasks function with URL...');
  const response = await fetch('https://fdecrxcxrshebgrmbywz.supabase.co/functions/v1/process-tasks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: audioUrl,
      preferredLanguage: 'he'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Transcription] Failed to start transcription. Status: ${response.status}, Error: ${errorText}`);
    throw new Error(`Failed to start transcription: ${response.statusText} - ${errorText}`);
  }

  const responseData = await response.json();
  console.log('[Transcription] Process-tasks response:', responseData);

  if (!responseData.jobId) {
    console.error('[Transcription] No jobId returned from process-tasks:', responseData);
    throw new Error('No jobId returned from transcription service');
  }

  const jobId = responseData.jobId;
  console.log(`[Transcription] Job started successfully. JobID: ${jobId}`);

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max (with 5 second delay)
  
  while (attempts < maxAttempts) {
    attempts++;
    console.log(`[Transcription] Checking status for jobId ${jobId} (attempt ${attempts}/${maxAttempts})`);
    
    const statusResponse = await fetch(
      `https://fdecrxcxrshebgrmbywz.supabase.co/functions/v1/process-tasks?jobId=${jobId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      console.error(`[Transcription] Status check failed. Status: ${statusResponse.status}, Error: ${errorText}`);
      throw new Error(`Failed to check transcription status: ${statusResponse.statusText} - ${errorText}`);
    }

    const status = await statusResponse.json();
    console.log(`[Transcription] Job ${jobId} status:`, status);
    
    if (status.status === 'completed' && status.result) {
      console.log(`[Transcription] Job ${jobId} completed successfully. Text length: ${status.result.length}`);
      return status.result;
    }

    if (status.status === 'failed') {
      console.error(`[Transcription] Job ${jobId} failed:`, status.error);
      throw new Error(`Transcription failed: ${status.error}`);
    }

    if (attempts === maxAttempts) {
      throw new Error(`Transcription timed out after ${maxAttempts} attempts`);
    }

    console.log(`[Transcription] Job ${jobId} still processing. Waiting 5 seconds before next check...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  throw new Error('Transcription failed: Max attempts reached');
}

// Add parseRequestBody function
async function parseRequestBody(request: Request): Promise<FormData> {
  const contentType = request.headers.get('content-type') || '';
  console.log('[JotForm Webhook] Content-Type:', contentType);
  
  let formData: FormData = {};
  
  if (contentType.includes('application/json')) {
    const rawBody = await request.text();
    console.log('[JotForm Webhook] Raw request body length:', rawBody.length);
    console.log('[JotForm Webhook] Raw request body preview:', rawBody.substring(0, 500));
    
    try {
      const parsedBody = JSON.parse(rawBody);
      
      // Check if this is Elementor form format
      if (Array.isArray(parsedBody) && 
          parsedBody.length > 0 && 
          parsedBody[0].form && 
          parsedBody[0].fields && 
          parsedBody[0].meta) {
        console.log('[JotForm Webhook] Detected Elementor form format as array, converting...');
        console.log('[JotForm Webhook] Elementor array details:', {
          length: parsedBody.length,
          formId: parsedBody[0].form.id,
          formName: parsedBody[0].form.name,
          fieldCount: Object.keys(parsedBody[0].fields).length,
          metaCount: Object.keys(parsedBody[0].meta).length
        });
        
        // Track conversion time
        const startTime = Date.now();
        formData = convertNewFormFormat(parsedBody[0]);
        const conversionTime = Date.now() - startTime;
        
        console.log(`[JotForm Webhook] Successfully converted Elementor form format to JotForm format in ${conversionTime}ms`);
        console.log('[JotForm Webhook] Conversion result:', {
          formID: formData.formID,
          submissionID: formData.submissionID,
          fieldCount: Object.keys(formData).length - 7, // Subtracting standard fields
          prettyLength: formData.pretty?.length || 0
        });
      } 
      // Check for single object Elementor format
      else if (parsedBody.form && parsedBody.fields && parsedBody.meta) {
        console.log('[JotForm Webhook] Detected Elementor form format as object, converting...');
        console.log('[JotForm Webhook] Elementor object details:', {
          formId: parsedBody.form.id,
          formName: parsedBody.form.name,
          fieldCount: Object.keys(parsedBody.fields).length,
          metaCount: Object.keys(parsedBody.meta).length
        });
        
        // Track conversion time
        const startTime = Date.now();
        formData = convertNewFormFormat(parsedBody);
        const conversionTime = Date.now() - startTime;
        
        console.log(`[JotForm Webhook] Successfully converted Elementor form format to JotForm format in ${conversionTime}ms`);
        console.log('[JotForm Webhook] Conversion result:', {
          formID: formData.formID,
          submissionID: formData.submissionID,
          fieldCount: Object.keys(formData).length - 7, // Subtracting standard fields
          prettyLength: formData.pretty?.length || 0
        });
      } 
      // Handle standard JotForm format
      else {
        formData = parsedBody;
        
        if (formData.rawRequest) {
          try {
            console.log('[JotForm Webhook] Attempting to parse rawRequest...');
            formData.parsedRequest = JSON.parse(formData.rawRequest);
            console.log('[JotForm Webhook] Successfully parsed rawRequest');
          } catch (e) {
            console.error('[JotForm Webhook] Failed to parse rawRequest:', e);
            formData.parsedRequest = formData.rawRequest;
          }
        }
      }
    } catch (e) {
      console.error('[JotForm Webhook] Failed to parse JSON body:', e);
      throw new Error(`Failed to parse request body: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  } else if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
    const formDataObj = await request.formData();
    formData = Object.fromEntries(formDataObj.entries()) as FormData;
    
    if (formData.rawRequest) {
      try {
        console.log('[JotForm Webhook] Attempting to parse rawRequest from form data...');
        const rawRequestData = JSON.parse(formData.rawRequest as string);
        
        // Check if this is the Elementor form format
        if (Array.isArray(rawRequestData) && 
            rawRequestData.length > 0 && 
            rawRequestData[0].form && 
            rawRequestData[0].fields && 
            rawRequestData[0].meta) {
          console.log('[JotForm Webhook] Detected Elementor form format in rawRequest as array, converting...');
          formData = convertNewFormFormat(rawRequestData[0]);
          console.log('[JotForm Webhook] Successfully converted Elementor form format to JotForm format');
        }
        // Check for single object Elementor format
        else if (rawRequestData.form && rawRequestData.fields && rawRequestData.meta) {
          console.log('[JotForm Webhook] Detected Elementor form format in rawRequest as object, converting...');
          formData = convertNewFormFormat(rawRequestData);
          console.log('[JotForm Webhook] Successfully converted Elementor form format to JotForm format');
        }
        else {
          formData.parsedRequest = rawRequestData;
          console.log('[JotForm Webhook] Successfully parsed rawRequest from form data');
        }
      } catch (e) {
        console.error('[JotForm Webhook] Failed to parse rawRequest from form data:', e);
        formData.parsedRequest = formData.rawRequest;
      }
    }
    
    // בדיקה נוספת אם יש שדות תמונה ישירות בטופס שאינם חלק מה-rawRequest
    for (const key in formData) {
      if (key !== 'rawRequest' && key !== 'parsedRequest' && typeof formData[key] === 'string') {
        const value = formData[key] as string;
        
        // בדיקה האם השדה מכיל תמונה
        const isUrl = value.startsWith('http://') || value.startsWith('https://');
        
        // בדיקה אם זו תמונה base64
        if (!isUrl && 
            ((value.includes('data:image/') && value.includes(';base64,')) ||
             value.startsWith('/9j/') || // JPEG בסיס 64
             value.startsWith('iVBOR') || // PNG בסיס 64
             (value.length > 1000 && value.match(/^[A-Za-z0-9+/=]{1000,}$/)))) {
          
          console.log(`[JotForm Webhook] Found image data in field ${key}, length: ${value.length}`);
          const originalLength = value.length;
          formData[key] = '[IMAGE DATA REMOVED]';
          const savedBytes = originalLength - formData[key].length;
          console.log(`[JotForm Webhook] Image data cleaned from field ${key}. Saved ${savedBytes} bytes (${Math.round(savedBytes/1024)}KB)`);
        }
      }
    }
  }

  return formData;
}

// פונקציה לניקוי תמונות מה-rawRequest
function cleanImagesFromRawRequest(formData: any) {
  if (!formData || !formData.rawRequest) return formData;
  
  // שמירת אורך ה-rawRequest המקורי לצורך לוג
  const originalLength = formData.rawRequest.length;
  let cleanedFieldsCount = 0;
  
  // פונקציית עזר לבדיקה אם מחרוזת היא URL
  function isUrl(str: string): boolean {
    try {
      const url = new URL(str);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  // פונקציית עזר לבדיקה אם מחרוזת מכילה תמונה מקודדת ב-base64
  function isBase64Image(str: string): boolean {
    // בדיקת פורמט של base64 מלא
    if (str.includes('data:image/') && str.includes(';base64,')) {
      return true;
    }
    
    // בדיקה לקידודים נפוצים של תמונות ללא התחלה מפורשת
    if (str.startsWith('/9j/') || // JPEG בבסיס 64
        str.startsWith('iVBOR')) { // PNG בבסיס 64
      return true;
    }
    
    // בדיקה למחרוזות ארוכות שנראות כמו base64
    // רק אם הן לא URL וגם מכילות תווים אופייניים ל-base64
    if (!isUrl(str) && 
        str.length > 1000 && 
        str.match(/^[A-Za-z0-9+/=]{1000,}$/)) {
      return true;
    }
    
    return false;
  }

  // פונקציה רקורסיבית לניקוי תמונות מכל המבנה
  function cleanImageData(obj: any, path: string = ''): any {
    // אם האובייקט הוא null או undefined, החזר אותו כמו שהוא
    if (obj === null || obj === undefined) return obj;

    // אם זו מחרוזת שמכילה נתוני תמונה
    if (typeof obj === 'string') {
      // אם זה URL, לא לנקות
      if (isUrl(obj)) {
        return obj;
      }
      
      // בדיקה אם זו תמונה מקודדת ב-base64
      if (isBase64Image(obj)) {
        const fieldInfo = path ? ` in field ${path}` : '';
        console.log(`[JotForm Webhook] Found image data${fieldInfo}, length: ${obj.length}`);
        cleanedFieldsCount++;
        return '[IMAGE DATA REMOVED]';
      }
      return obj;
    }

    // אם זה מערך, עבור על כל איבר
    if (Array.isArray(obj)) {
      return obj.map((item, index) => cleanImageData(item, path ? `${path}[${index}]` : `[${index}]`));
    }

    // אם זה אובייקט, עבור על כל שדה
    if (typeof obj === 'object') {
      const result: { [key: string]: any } = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          result[key] = cleanImageData(obj[key], path ? `${path}.${key}` : key);
        }
      }
      return result;
    }

    // אחרת החזר כמו שזה
    return obj;
  }

  try {
    // בדיקה אם rawRequest הוא מחרוזת JSON, ואם כן - ננסה לפרסר אותו
    if (typeof formData.rawRequest === 'string') {
      try {
        let rawObj = JSON.parse(formData.rawRequest);
        const cleanedObj = cleanImageData(rawObj);
        
        // המר חזרה למחרוזת
        const newRawRequest = JSON.stringify(cleanedObj);
        
        // אם היה שינוי, עדכן את ה-rawRequest
        if (newRawRequest.length < originalLength) {
          formData.rawRequest = newRawRequest;
          const savedBytes = originalLength - formData.rawRequest.length;
          console.log(`[JotForm Webhook] Images cleaned from rawRequest. Fields cleaned: ${cleanedFieldsCount}, Original length: ${originalLength}, New length: ${formData.rawRequest.length}, Saved: ${savedBytes} bytes (${Math.round(savedBytes/1024)}KB)`);
        }
      } catch (e) {
        console.error('[JotForm Webhook] Error parsing rawRequest JSON:', e);
      }
    }

    // נקה גם את parsedRequest אם קיים
    if (formData.parsedRequest) {
      const cleanedParsedRequest = cleanImageData(formData.parsedRequest);
      formData.parsedRequest = cleanedParsedRequest;
    }

    return formData;
  } catch (error) {
    console.error('[JotForm Webhook] Error cleaning images from rawRequest:', error);
    return formData;
  }
}

// Add triggerProcessWithRetry function
async function triggerProcessWithRetry(submission: any, retryCount = 0, maxRetries = 5) {
  try {
    // Use the base URL from the environment or default to the production URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://md-html-template.vercel.app';
    const processUrl = `${baseUrl}/api/process`;
    
    console.log('[Process] Triggering process:', {
      url: processUrl,
      baseUrl,
      attempt: retryCount + 1,
      submissionId: submission.submission_id
    });

    const response = await fetch(processUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        submissionId: submission.submission_id,
        _timestamp: Date.now()
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('[Process] Error in background processing:', error.message);
      if (retryCount < maxRetries) {
        const delay = Math.min(5000 * Math.pow(2, retryCount), 80000);
        await new Promise(resolve => setTimeout(resolve, delay));
        return triggerProcessWithRetry(submission, retryCount + 1, maxRetries);
      }
    }
    throw error;
  }
}

export const runtime = 'nodejs';
export const maxDuration = 300; // Increase timeout to 5 minutes to handle transcriptions

export async function POST(request: Request) {
  try {
    console.log('[JotForm Webhook] Starting to process request...');
    
    // Parse the request body
    let formData;
    try {
      formData = await parseRequestBody(request);
      
      // ניקוי תמונות מה-rawRequest לפני שמירה במסד הנתונים
      formData = cleanImagesFromRawRequest(formData);
    } catch (error) {
      console.error('[JotForm Webhook] Failed to parse request body:', error);
      return NextResponse.json({ 
        status: 'error',
        error: 'Failed to parse request body',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 200 });
    }

    // Validate required fields
    if (!formData.formID || !formData.submissionID) {
      console.error('[JotForm Webhook] Missing required fields:', { formID: formData.formID, submissionID: formData.submissionID });
      return NextResponse.json({
        status: 'error',
        error: 'Missing required fields',
        details: { formID: !!formData.formID, submissionID: !!formData.submissionID }
      }, { status: 200 });
    }

    // Create initial submission record
    let submission;
    try {
      // Check for audio files (but don't fail if we can't find them)
      let audioFiles: AudioFile[] = [];
      try {
        audioFiles = findAudioFiles(formData.parsedRequest || formData);
        console.log('[JotForm Webhook] Found audio files:', JSON.stringify(audioFiles, null, 2));
      } catch (error) {
        console.error('[JotForm Webhook] Error finding audio files:', error);
      }

      const { data, error: submissionError } = await supabaseAdmin
        .from('form_submissions')
        .insert({
          form_id: formData.formID,
          submission_id: formData.submissionID,
          content: formData,
          status: 'pending_processing',
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (submissionError) {
        console.error('[JotForm Webhook] Error creating submission:', submissionError);
        return NextResponse.json({ 
          status: 'error',
          error: 'Failed to create submission',
          details: submissionError.message
        }, { status: 200 });
      }

      submission = data;

      // If we have audio files, handle them in a separate flow
      if (audioFiles.length > 0) {
        // Update status to indicate audio processing
        await supabaseAdmin
          .from('form_submissions')
          .update({
            content: {
              ...formData,
              has_audio: true,
              audio_count: audioFiles.length,
              transcription_status: 'pending',
              original_audio_files: audioFiles
            },
            status: 'transcribing'
          })
          .eq('submission_id', submission.submission_id);

        // Process each audio file
        for (const { path, fieldName, questionLabel } of audioFiles) {
          try {
            console.log(`[JotForm Webhook] Transcribing audio for field: ${fieldName}`);
            const transcription = await transcribeAudio(path);
            
            updateFormDataWithTranscription(formData, {
              fieldName,
              transcription,
              questionLabel,
              path
            });

            await supabaseAdmin
              .from('form_submissions')
              .update({
                content: {
                  ...formData,
                  transcription_status: 'in_progress',
                  transcriptions: [
                    ...(formData.transcriptions || []),
                    { fieldName, path, questionLabel, transcription }
                  ]
                }
              })
              .eq('submission_id', submission.submission_id);

          } catch (error) {
            console.error(`[JotForm Webhook] Transcription failed for ${path}:`, error);
            try {
              await supabaseAdmin
                .from('form_submissions')
                .update({
                  content: {
                    ...formData,
                    transcription_status: 'partial',
                    transcription_errors: [
                      ...(formData.transcription_errors || []),
                      { 
                        fieldName, 
                        path, 
                        error: error instanceof Error ? error.message : 'Unknown error'
                      }
                    ]
                  }
                })
                .eq('submission_id', submission.submission_id);
            } catch (updateError) {
              console.error('[JotForm Webhook] Failed to update error status:', updateError);
            }
          }
        }

        // Update final audio status
        console.log('[JotForm Webhook] Final form data structure:', JSON.stringify({
          parsedRequest: formData.parsedRequest,
          transcriptions: formData.transcriptions,
          pretty: formData.pretty
        }, null, 2));

        await supabaseAdmin
          .from('form_submissions')
          .update({
            content: {
              ...formData,
              transcription_status: 'completed',
              has_audio: true,
              audio_count: audioFiles.length
            },
            status: 'pending_processing'
          })
          .eq('submission_id', submission.submission_id);
      }

      // Trigger processing in background (regardless of audio)
      triggerProcessWithRetry(submission).catch(error => {
        console.error('[Process] Error in background processing:', error);
      });

      return NextResponse.json({
        status: 'success',
        message: 'Submission received and processing started',
        submissionId: submission.submission_id,
        links: {
          status: `/api/submission/status?id=${submission.submission_id}`,
          results: `/results?s=${submission.submission_id}`
        }
      }, { status: 200 });

    } catch (error) {
      console.error('[JotForm Webhook] Error in submission processing:', error);
      return NextResponse.json({ 
        status: 'error',
        error: 'Failed to process submission',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 200 });
    }

  } catch (error) {
    console.error('[JotForm Webhook] Unhandled error:', error);
    return NextResponse.json({ 
      status: 'error',
      error: 'Unhandled error in webhook processing',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 200 });
  }
}

// Helper function to update form data with transcription
function updateFormDataWithTranscription(formData: any, {
  fieldName,
  transcription,
  questionLabel,
  path
}: {
  fieldName: string;
  transcription: string;
  questionLabel?: string;
  path: string;
}) {
  // Update in parsedRequest
  if (formData.parsedRequest) {
    const keys = fieldName.split('.');
    let current = formData.parsedRequest;
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = transcription;
  }

  // Update in main formData
  formData[fieldName] = transcription;
  
  // Update in q73_input73 style fields
  const shortFieldName = fieldName.split('.').pop();
  if (shortFieldName && formData[`q${shortFieldName}`]) {
    formData[`q${shortFieldName}`] = transcription;
  }
  
  // Update pretty field
  if (formData.pretty && questionLabel) {
    formData.pretty = formData.pretty.replace(
      `${questionLabel}:${path}`,
      `${questionLabel}:${transcription}`
    );
  }

  // Store transcription in array
  formData.transcriptions = [
    ...(formData.transcriptions || []),
    { fieldName, path, questionLabel, transcription }
  ];
}

export async function GET(request: Request) {
  try {
    console.log('[JotForm Results] Processing GET request');
    const { searchParams } = new URL(request.url);
    const formId = searchParams.get('formId');
    
    if (!formId) {
      console.log('[JotForm Results] Missing formId parameter');
      return NextResponse.json(
        { error: 'formId is required' },
        { status: 400 }
      );
    }

    console.log(`[JotForm Results] Fetching submissions for form: ${formId}`);
    // Get submissions for this form only
    const { data: submissions, error } = await supabaseAdmin
      .from('form_submissions')
      .select('*')
      .eq('form_id', formId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[JotForm Results] Error fetching submissions:', error);
      throw error;
    }

    console.log(`[JotForm Results] Successfully fetched ${submissions?.length || 0} submissions`);

    // Process and enrich the submissions data
    const enrichedSubmissions = submissions?.map(sub => ({
      ...sub,
      processing_status: {
        status: sub.status,
        stage: sub.stage || sub.progress?.stage,
        last_update: sub.updated_at,
        duration: sub.updated_at ? 
          Math.round((new Date(sub.updated_at).getTime() - new Date(sub.created_at).getTime()) / 1000) : 
          null,
        error: sub.error || sub.progress?.details?.error,
        current_message: sub.message || sub.progress?.message,
      },
      audio_files: sub.content?.transcriptions || [],
      has_audio: sub.has_audio || sub.content && Object.values(sub.content).some(
        (val: any) => typeof val === 'string' && 
          (val.includes('/widget-uploads/voiceRecorder/') || val.includes('.mp3'))
      ),
      has_transcription: sub.transcription_status === 'completed' || sub.content?.transcriptions?.some(
        (t: any) => t.transcription && t.transcription.length > 0
      ),
      transcriptions: (sub.content?.transcriptions || []).map((t: any) => ({
        ...t,
        question: t.questionLabel,
        field: t.fieldName,
        audio_url: t.path,
        text: t.transcription
      })),
      latest_log: sub.logs ? sub.logs[sub.logs.length - 1] : null,
    }));

    console.log(`[JotForm Results] Successfully processed ${enrichedSubmissions?.length || 0} submissions with details`);
    
    // Log some stats about the submissions
    const stats = {
      total: enrichedSubmissions?.length || 0,
      pending: enrichedSubmissions?.filter(s => s.status === 'pending').length || 0,
      completed: enrichedSubmissions?.filter(s => s.status === 'completed').length || 0,
      failed: enrichedSubmissions?.filter(s => s.status === 'error').length || 0,
      with_audio: enrichedSubmissions?.filter(s => s.has_audio).length || 0,
      with_transcription: enrichedSubmissions?.filter(s => s.has_transcription).length || 0,
      transcription_status: {
        none: enrichedSubmissions?.filter(s => !s.has_audio).length || 0,
        pending: enrichedSubmissions?.filter(s => s.has_audio && !s.has_transcription).length || 0,
        completed: enrichedSubmissions?.filter(s => s.has_transcription).length || 0,
        failed: enrichedSubmissions?.filter(s => s.has_audio && s.transcription_status === 'failed').length || 0
      }
    };

    return NextResponse.json(enrichedSubmissions);
  } catch (error) {
    console.error('[JotForm Results] Error in GET request:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Test endpoint for converting new form format to standard format
export async function PUT(request: Request) {
  try {
    console.log('======================================================');
    console.log('[Elementor Form Test] Starting test conversion endpoint');
    console.log('======================================================');
    
    // Parse request body
    const rawBody = await request.text();
    console.log(`[Elementor Form Test] Received request with ${rawBody.length} characters`);
    
    try {
      console.log('[Elementor Form Test] Attempting conversion...');
      
      // Track execution time
      const startTime = Date.now();
      
      // Attempt to convert the Elementor form format
      const convertedData = convertNewFormFormatFromJsonString(rawBody);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      console.log(`[Elementor Form Test] Conversion successful! Took ${executionTime}ms`);
      console.log('[Elementor Form Test] Conversion summary:');
      console.log(`  - Form ID: ${convertedData.formID}`);
      console.log(`  - Submission ID: ${convertedData.submissionID}`);
      console.log(`  - Total fields mapped: ${Object.keys(convertedData).length - 5}`); // Subtracting standard fields
      console.log(`  - Pretty field length: ${convertedData.pretty?.length || 0} characters`);
      
      // Log all generated field keys
      const fieldKeys = Object.keys(convertedData)
        .filter(key => !['formID', 'submissionID', 'submission_id', 'parsedRequest', 'rawRequest', 'pretty', 'formProvider'].includes(key));
      
      console.log(`[Elementor Form Test] Generated field keys (${fieldKeys.length}):`, 
        fieldKeys.length > 20 ? [...fieldKeys.slice(0, 20), `... and ${fieldKeys.length - 20} more`] : fieldKeys);
      
      // Create a response that shows the conversion details
      const response = {
        status: 'success',
        message: 'Successfully converted Elementor form format',
        formProvider: 'elementor',
        executionTime: `${executionTime}ms`,
        original: {
          structure: Array.isArray(JSON.parse(rawBody)) ? 'Array' : 'Object',
          preview: JSON.stringify(JSON.parse(rawBody)).substring(0, 200) + '...'
        },
        converted: {
          formID: convertedData.formID,
          submissionID: convertedData.submissionID,
          pretty: convertedData.pretty?.substring(0, 200) + (convertedData.pretty && convertedData.pretty.length > 200 ? '...' : ''),
          fieldCount: fieldKeys.length,
        },
        // Include sample field mappings
        fieldMappings: Object.entries(convertedData)
          .filter(([key, value]) => !['formID', 'submissionID', 'parsedRequest', 'rawRequest', 'pretty', 'formProvider', 'submission_id'].includes(key))
          .slice(0, 10)
          .reduce((acc, [key, value]) => ({
            ...acc, 
            [key]: typeof value === 'string' && value.length > 100 
              ? value.substring(0, 100) + '...' 
              : value
          }), {})
      };
      
      console.log('======================================================');
      console.log('[Elementor Form Test] Test completed successfully');
      console.log('======================================================');
      
      return NextResponse.json(response);
    } catch (error) {
      console.error('[Elementor Form Test] Conversion failed:', error);
      console.log('======================================================');
      console.log('[Elementor Form Test] Test failed');
      console.log('======================================================');
      
      return NextResponse.json({
        status: 'error',
        message: 'Failed to convert Elementor form format',
        error: error instanceof Error ? error.message : 'Unknown error',
        errorDetails: error instanceof Error ? error.stack : 'No stack trace available'
      }, { status: 400 });
    }
  } catch (error) {
    console.error('[Elementor Form Test] Unhandled error:', error);
    console.log('======================================================');
    console.log('[Elementor Form Test] Test failed with unhandled error');
    console.log('======================================================');
    
    return NextResponse.json({
      status: 'error',
      message: 'Unhandled error in converting Elementor form format',
      error: error instanceof Error ? error.message : 'Unknown error',
      errorDetails: error instanceof Error ? error.stack : 'No stack trace available'
    }, { status: 500 });
  }
} 