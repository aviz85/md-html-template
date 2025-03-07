import { NextResponse } from 'next/server';

export const runtime = 'edge';

// Define the expected fields in the JotForm submission
interface JotFormSubmission {
  formID?: string;
  submissionID?: string; 
  pretty?: string;
  rawRequest?: string;
  parsedRequest?: any;
  [key: string]: any;
}

// Helper function to extract form field values from different JotForm formats
function extractFieldValue(formData: any, fieldIdentifiers: string[]): string | null {
  // Try to extract from parsedRequest if it exists
  if (formData.parsedRequest) {
    for (const identifier of fieldIdentifiers) {
      // Check in formData.parsedRequest structure
      for (const key in formData.parsedRequest) {
        const field = formData.parsedRequest[key];
        
        // Check if the field's name or question text matches any of our identifiers
        if (field && 
            ((field.name && fieldIdentifiers.some(id => field.name.toLowerCase().includes(id.toLowerCase()))) || 
            (field.text && fieldIdentifiers.some(id => field.text.toLowerCase().includes(id.toLowerCase()))) ||
            (field.title && fieldIdentifiers.some(id => field.title.toLowerCase().includes(id.toLowerCase()))))) {
          
          // Return the answer/value
          return field.answer || field.value || null;
        }
      }
    }
  }

  // Try to extract from 'pretty' field if it exists
  if (formData.pretty && typeof formData.pretty === 'string') {
    for (const identifier of fieldIdentifiers) {
      // Look for patterns like "שם מלא:אביץ" or "אימייל:example@example.com"
      const regexPatterns = [
        new RegExp(`${identifier}[^:]*:([^,]+)`, 'i'),  // General pattern
        new RegExp(`${identifier}[^:]*:\\s*([^,]+)`, 'i')  // With potential spaces
      ];
      
      for (const regex of regexPatterns) {
        const match = formData.pretty.match(regex);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
    }
  }
  
  // Check in the raw submission data (flat structure)
  for (const identifier of fieldIdentifiers) {
    for (const key in formData) {
      if (key.toLowerCase().includes(identifier.toLowerCase()) && formData[key]) {
        return formData[key];
      }
    }
  }

  // If we couldn't find a value, return null
  return null;
}

// Function to parse multipart/form-data format
async function parseMultipartFormData(request: Request, boundary: string): Promise<JotFormSubmission> {
  const formData: JotFormSubmission = {};
  
  try {
    // Clone request to get text content
    const clonedRequest = request.clone();
    const text = await clonedRequest.text();
    
    // Split the content by boundary
    const parts = text.split(`--${boundary}`);
    
    // Process each part
    for (const part of parts) {
      // Skip empty parts and the final boundary
      if (!part || part.trim() === '--') continue;
      
      // Get the content disposition line and extract name
      const nameMatch = part.match(/Content-Disposition:.*name="([^"]+)"/i);
      if (!nameMatch) continue;
      
      const name = nameMatch[1];
      
      // Extract the value (content after the blank line)
      const value = part.split(/\r?\n\r?\n/).slice(1).join('\n').trim();
      
      // Skip empty values
      if (!value) continue;
      
      // Add to form data
      formData[name] = value;
      
      // Special case for rawRequest: try to parse as JSON
      if (name === 'rawRequest' && value.startsWith('{')) {
        try {
          formData.parsedRequest = JSON.parse(value);
        } catch (e) {
          console.error('[Sharoni API] Failed to parse rawRequest in multipart form:', e);
        }
      }
      
      // If we find a submission data field, try to extract more info
      if (name === 'submissionData' || name === 'pretty' || name === 'formData') {
        try {
          const jsonData = JSON.parse(value);
          if (typeof jsonData === 'object') {
            // Merge the JSON data into the formData
            Object.assign(formData, jsonData);
            if (!formData.parsedRequest) {
              formData.parsedRequest = jsonData;
            }
          }
        } catch (e) {
          console.error(`[Sharoni API] Failed to parse ${name} as JSON:`, e);
        }
      }
    }
    
    console.log('[Sharoni API] Successfully parsed multipart/form-data');
    return formData;
  } catch (error) {
    console.error('[Sharoni API] Error parsing multipart/form-data:', error);
    return formData;
  }
}

export async function POST(request: Request) {
  try {
    console.log('[Sharoni API] Starting to process request...');
    
    // Capture the request body for logging
    const requestClone = request.clone();
    const rawBody = await requestClone.text();
    
    // For debugging: Log the raw request body
    console.log('[Sharoni API] Raw request body:', rawBody.substring(0, 500) + (rawBody.length > 500 ? '...' : ''));
    
    // Parse the request body
    const contentType = request.headers.get('content-type') || '';
    let formData: JotFormSubmission = {};
    
    if (contentType.includes('application/json')) {
      try {
        formData = JSON.parse(rawBody);
        
        // Process the rawRequest field if it exists
        if (formData.rawRequest && typeof formData.rawRequest === 'string' && formData.rawRequest.startsWith('{')) {
          try {
            formData.parsedRequest = JSON.parse(formData.rawRequest);
            console.log('[Sharoni API] Successfully parsed rawRequest JSON');
          } catch (e) {
            console.error('[Sharoni API] Failed to parse rawRequest JSON:', e);
          }
        }
      } catch (e) {
        console.error('[Sharoni API] Failed to parse request body as JSON:', e);
        
        // Try to recover - maybe it's URL encoded but with wrong content type
        if (rawBody.includes('=') && rawBody.includes('&')) {
          try {
            const params = new URLSearchParams(rawBody);
            formData = Object.fromEntries(params.entries());
            console.log('[Sharoni API] Recovered by parsing as URL encoded form data');
          } catch (formError) {
            console.error('[Sharoni API] Failed to recover by parsing as form data:', formError);
          }
        }
      }
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      try {
        const params = new URLSearchParams(rawBody);
        formData = Object.fromEntries(params.entries());
      } catch (e) {
        console.error('[Sharoni API] Failed to parse form data:', e);
      }
      
      // Parse rawRequest if it exists and looks like JSON
      if (formData.rawRequest && typeof formData.rawRequest === 'string' && formData.rawRequest.startsWith('{')) {
        try {
          formData.parsedRequest = JSON.parse(formData.rawRequest);
        } catch (e) {
          console.error('[Sharoni API] Failed to parse rawRequest:', e);
        }
      }
    } else if (contentType.includes('multipart/form-data')) {
      console.log('[Sharoni API] Detected multipart/form-data');
      
      // Extract the boundary from the content type
      const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
      if (boundaryMatch) {
        const boundary = boundaryMatch[1] || boundaryMatch[2];
        formData = await parseMultipartFormData(request, boundary);
      } else {
        console.error('[Sharoni API] Could not extract boundary from multipart/form-data');
      }
      
      // Search for a submission ID in the rawBody directly if none was found
      if (!formData.submissionID) {
        const submissionIdMatch = rawBody.match(/name="submissionID"\s*\r?\n\r?\n([^\r\n]+)/);
        if (submissionIdMatch) {
          formData.submissionID = submissionIdMatch[1].trim();
        }
      }
      
      // Look for form ID specifically
      if (!formData.formID) {
        const formIdMatch = rawBody.match(/name="formID"\s*\r?\n\r?\n([^\r\n]+)/);
        if (formIdMatch) {
          formData.formID = formIdMatch[1].trim();
        }
      }
    } else {
      // Unknown content type - try multiple approaches
      console.log('[Sharoni API] Unknown content type:', contentType);
      
      // Check if it's multipart/form-data without proper content-type
      if (rawBody.includes('Content-Disposition: form-data;')) {
        console.log('[Sharoni API] Detected multipart/form-data signature without proper content-type');
        
        // Try to extract boundary from the content
        const boundaryMatch = rawBody.match(/[-]{2,}([a-zA-Z0-9]+)/);
        if (boundaryMatch) {
          const boundary = boundaryMatch[1];
          formData = await parseMultipartFormData(request, boundary);
        }
      } else {
        // Try parsing as JSON first
        try {
          formData = JSON.parse(rawBody);
          
          // Process the rawRequest field if it exists
          if (formData.rawRequest && typeof formData.rawRequest === 'string' && formData.rawRequest.startsWith('{')) {
            try {
              formData.parsedRequest = JSON.parse(formData.rawRequest);
              console.log('[Sharoni API] Successfully parsed rawRequest JSON');
            } catch (e) {
              console.error('[Sharoni API] Failed to parse rawRequest JSON:', e);
            }
          }
        } catch (e) {
          console.log('[Sharoni API] Not valid JSON, trying URL encoded form');
          
          // Try as URL encoded form
          if (rawBody.includes('=') && rawBody.includes('&')) {
            try {
              const params = new URLSearchParams(rawBody);
              formData = Object.fromEntries(params.entries());
            } catch (formError) {
              console.error('[Sharoni API] Failed to parse as form data:', formError);
            }
          } else {
            console.error('[Sharoni API] Unable to parse request body in any known format');
          }
        }
      }
    }
    
    // Log the parsed form data for debugging
    console.log('[Sharoni API] Parsed form data:', JSON.stringify(formData, null, 2).substring(0, 500) + (JSON.stringify(formData, null, 2).length > 500 ? '...' : ''));
    
    // Extract required fields for SendMsg API
    // These arrays contain potential field identifiers that could match in the JotForm data
    const name = extractFieldValue(formData, ['name', 'fullname', 'full name', 'שם', 'שם מלא']);
    const email = extractFieldValue(formData, ['email', 'mail', 'אימייל', 'מייל', 'דוא"ל']);
    const cellphone = extractFieldValue(formData, ['phone', 'cellphone', 'mobile', 'טלפון', 'נייד', 'סלולרי', 'מספר טלפון']);
    const birthdate = extractFieldValue(formData, ['birth', 'birthday', 'date of birth', 'תאריך לידה', 'יום הולדת']);
    
    // Format birthdate if needed (assuming it could be in various formats)
    let formattedBirthdate = birthdate;
    if (birthdate) {
      // Try to parse the date and format it as DD-MM-YYYY
      try {
        const date = new Date(birthdate);
        if (!isNaN(date.getTime())) {
          const day = date.getDate().toString().padStart(2, '0');
          const month = (date.getMonth() + 1).toString().padStart(2, '0');
          const year = date.getFullYear();
          formattedBirthdate = `${day}-${month}-${year}`;
        }
      } catch (e) {
        console.warn('[Sharoni API] Failed to format birthdate:', e);
      }
    }

    // Create the payload for SendMsg
    const sendMsgPayload = new URLSearchParams();
    if (name) sendMsgPayload.append('4', name);
    if (email) sendMsgPayload.append('email', email);
    if (cellphone) sendMsgPayload.append('cellphone', cellphone);
    if (formattedBirthdate) sendMsgPayload.append('6', formattedBirthdate);
    
    // Always include the form ID - Sharoni specific form ID
    sendMsgPayload.append('form', '338449__65661e0b-29e9-45ab-ad81-3470de641084');
    
    // Log the data we're sending
    console.log('[Sharoni API] Sending data to SendMsg:', Object.fromEntries(sendMsgPayload.entries()));
    
    // Send data to SendMsg API
    const sendMsgResponse = await fetch('https://panel.sendmsg.co.il/AddUserFromSite.aspx', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: sendMsgPayload,
    });
    
    // Process the response from SendMsg
    const responseText = await sendMsgResponse.text();
    const isSuccess = sendMsgResponse.ok || responseText.includes('Inserted');
    
    console.log('[Sharoni API] SendMsg API response status:', sendMsgResponse.status);
    console.log('[Sharoni API] SendMsg API response:', responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));
    
    // Return response
    return NextResponse.json({
      status: isSuccess ? 'success' : 'error',
      message: isSuccess ? 'Data successfully sent to SendMsg' : 'Failed to send data to SendMsg',
      details: {
        sendMsgResponseStatus: sendMsgResponse.status,
        parsedFields: {
          name,
          email,
          cellphone,
          birthdate: formattedBirthdate
        },
        formDataKeys: Object.keys(formData),
        receivedContentType: contentType
      }
    }, { status: 200 });
    
  } catch (error) {
    console.error('[Sharoni API] Error processing request:', error);
    return NextResponse.json({
      status: 'error',
      error: 'Failed to process request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 200 });
  }
} 