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

export async function POST(request: Request) {
  try {
    console.log('[JotForm to SendMsg] Starting to process request...');
    
    // Capture the request body for logging
    const requestClone = request.clone();
    const rawBody = await requestClone.text();
    
    // For debugging: Log the raw request body
    console.log('[JotForm to SendMsg] Raw request body:', rawBody.substring(0, 500) + (rawBody.length > 500 ? '...' : ''));
    
    // Parse the request body
    const contentType = request.headers.get('content-type') || '';
    let formData: JotFormSubmission = {};
    
    if (contentType.includes('application/json')) {
      try {
        formData = JSON.parse(rawBody);
      } catch (e) {
        console.error('[JotForm to SendMsg] Failed to parse request body as JSON:', e);
        
        // Try to recover - maybe it's URL encoded but with wrong content type
        if (rawBody.includes('=') && rawBody.includes('&')) {
          try {
            const params = new URLSearchParams(rawBody);
            formData = Object.fromEntries(params.entries());
            console.log('[JotForm to SendMsg] Recovered by parsing as URL encoded form data');
          } catch (formError) {
            console.error('[JotForm to SendMsg] Failed to recover by parsing as form data:', formError);
          }
        }
      }
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      try {
        const params = new URLSearchParams(rawBody);
        formData = Object.fromEntries(params.entries());
      } catch (e) {
        console.error('[JotForm to SendMsg] Failed to parse form data:', e);
      }
      
      // Parse rawRequest if it exists and looks like JSON
      if (formData.rawRequest && typeof formData.rawRequest === 'string' && formData.rawRequest.startsWith('{')) {
        try {
          formData.parsedRequest = JSON.parse(formData.rawRequest);
        } catch (e) {
          console.error('[JotForm to SendMsg] Failed to parse rawRequest:', e);
        }
      }
    } else {
      // Unknown content type - try multiple approaches
      console.log('[JotForm to SendMsg] Unknown content type:', contentType);
      
      // Try parsing as JSON first
      try {
        formData = JSON.parse(rawBody);
      } catch (e) {
        console.log('[JotForm to SendMsg] Not valid JSON, trying URL encoded form');
        
        // Try as URL encoded form
        if (rawBody.includes('=') && rawBody.includes('&')) {
          try {
            const params = new URLSearchParams(rawBody);
            formData = Object.fromEntries(params.entries());
          } catch (formError) {
            console.error('[JotForm to SendMsg] Failed to parse as form data:', formError);
          }
        } else {
          console.error('[JotForm to SendMsg] Unable to parse request body in any known format');
        }
      }
    }
    
    // Log the parsed form data for debugging
    console.log('[JotForm to SendMsg] Parsed form data:', JSON.stringify(formData, null, 2).substring(0, 500) + (JSON.stringify(formData, null, 2).length > 500 ? '...' : ''));
    
    // Extract required fields for SendMsg API
    // These arrays contain potential field identifiers that could match in the JotForm data
    const name = extractFieldValue(formData, ['name', 'fullname', 'full name', 'שם', 'שם מלא']);
    const email = extractFieldValue(formData, ['email', 'mail', 'אימייל', 'מייל', 'דוא"ל']);
    const cellphone = extractFieldValue(formData, ['phone', 'cellphone', 'mobile', 'טלפון', 'נייד', 'סלולרי']);
    const birthdate = extractFieldValue(formData, ['birth', 'birthday', 'date of birth', 'תאריך לידה', 'יום הולדת']);
    
    // Look for a hidden field that contains the SendMsg form ID
    const sendMsgFormId = extractFieldValue(formData, ['sendmsg_form_id', 'sendmsg_form', 'sendmsg', 'form_id', 'מזהה טופס']);
    const defaultFormId = '338449__65661e0b-29e9-45ab-ad81-3470de641084'; // Default form ID
    
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
        console.warn('[JotForm to SendMsg] Failed to format birthdate:', e);
      }
    }

    // Create the payload for SendMsg
    const sendMsgPayload = new URLSearchParams();
    if (name) sendMsgPayload.append('4', name);
    if (email) sendMsgPayload.append('email', email);
    if (cellphone) sendMsgPayload.append('cellphone', cellphone);
    if (formattedBirthdate) sendMsgPayload.append('6', formattedBirthdate);
    
    // Use the extracted form ID if found, otherwise use the default
    sendMsgPayload.append('form', sendMsgFormId || defaultFormId);
    
    // Log the data we're sending
    console.log('[JotForm to SendMsg] Sending data to SendMsg:', Object.fromEntries(sendMsgPayload.entries()));
    
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
    
    console.log('[JotForm to SendMsg] SendMsg API response status:', sendMsgResponse.status);
    console.log('[JotForm to SendMsg] SendMsg API response:', responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));
    
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
          birthdate: formattedBirthdate,
          sendMsgFormId: sendMsgFormId || defaultFormId
        },
        receivedContentType: contentType
      }
    }, { status: 200 });
    
  } catch (error) {
    console.error('[JotForm to SendMsg] Error processing request:', error);
    return NextResponse.json({
      status: 'error',
      error: 'Failed to process request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 200 });
  }
} 