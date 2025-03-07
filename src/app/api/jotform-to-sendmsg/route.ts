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
    
    // Parse the request body
    const contentType = request.headers.get('content-type') || '';
    let formData: JotFormSubmission;
    
    if (contentType.includes('application/json')) {
      formData = await request.json();
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formUrlEncoded = await request.text();
      const params = new URLSearchParams(formUrlEncoded);
      
      formData = Object.fromEntries(params.entries());
      
      // Parse rawRequest if it exists and looks like JSON
      if (formData.rawRequest && formData.rawRequest.startsWith('{')) {
        try {
          formData.parsedRequest = JSON.parse(formData.rawRequest);
        } catch (e) {
          console.error('[JotForm to SendMsg] Failed to parse rawRequest:', e);
        }
      }
    } else {
      // Fallback to text
      const text = await request.text();
      try {
        formData = JSON.parse(text);
      } catch (e) {
        console.error('[JotForm to SendMsg] Failed to parse request body as JSON:', e);
        formData = { rawText: text };
      }
    }
    
    // Extract required fields for SendMsg API
    // These arrays contain potential field identifiers that could match in the JotForm data
    const name = extractFieldValue(formData, ['name', 'fullname', 'full name', 'שם', 'שם מלא']);
    const email = extractFieldValue(formData, ['email', 'mail', 'אימייל', 'מייל', 'דוא"ל']);
    const cellphone = extractFieldValue(formData, ['phone', 'cellphone', 'mobile', 'טלפון', 'נייד', 'סלולרי']);
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
        console.warn('[JotForm to SendMsg] Failed to format birthdate:', e);
      }
    }

    // Create the payload for SendMsg
    const sendMsgPayload = new URLSearchParams();
    if (name) sendMsgPayload.append('4', name);
    if (email) sendMsgPayload.append('email', email);
    if (cellphone) sendMsgPayload.append('cellphone', cellphone);
    if (formattedBirthdate) sendMsgPayload.append('6', formattedBirthdate);
    
    // Always include the form ID
    sendMsgPayload.append('form', '338449__65661e0b-29e9-45ab-ad81-3470de641084');
    
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
        extractedFields: {
          name,
          email,
          cellphone,
          birthdate: formattedBirthdate
        }
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