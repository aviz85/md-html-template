# Webhook Payload Documentation

This document describes the structure of the webhook payload that is sent when a form submission is processed.

## Payload Structure

```typescript
{
  form: {
    id: string;            // The JotForm form ID
    submission_id: string; // Unique identifier for this submission
    results_url: string;   // URL to view the results (https://md-html-template.vercel.app/results?s=SUBMISSION_ID)
  },
  customer: {
    name?: string;    // Customer's name if found in form data
    email?: string;   // Customer's email if found in form data
    phone?: string;   // Customer's phone if found in form data
  },
  form_data: {
    // All form fields and their values
    [key: string]: any;
  },
  result: {
    finalResponse: string;  // The processed result text
    tokenCount: number;     // Number of tokens used in processing
  }
}
```

## Field Descriptions

### Form Object
- `id`: The JotForm form identifier
- `submission_id`: A unique identifier for this specific submission
- `results_url`: A direct URL to view the results of this submission

### Customer Object
The customer object attempts to automatically find and extract customer information from the form data using common field patterns:

- `name`: Extracted from fields matching patterns like:
  - name, fullname, full_name
  - שם, שם_מלא
  - firstName, lastName
  - שם משפחה, שם פרטי

- `email`: Extracted from fields matching patterns like:
  - email, mail
  - אימייל, מייל
  - דואר אלקטרוני

- `phone`: Extracted from fields matching patterns like:
  - phone, mobile, tel
  - טלפון, נייד
  - מספר טלפון

### Form Data Object
Contains all the raw form fields and their values as submitted. This is useful for accessing any additional form fields that aren't part of the standard customer information.

### Result Object
Contains the processed result of the submission:
- `finalResponse`: The final processed text/analysis
- `tokenCount`: The number of tokens used in processing the submission

## Example

```json
{
  "form": {
    "id": "123456789012345",
    "submission_id": "abc123xyz789",
    "results_url": "https://md-html-template.vercel.app/results?s=abc123xyz789"
  },
  "customer": {
    "name": "ישראל ישראלי",
    "email": "israel@example.com",
    "phone": "0501234567"
  },
  "form_data": {
    "name": "ישראל ישראלי",
    "email": "israel@example.com",
    "phone": "0501234567",
    "message": "תוכן ההודעה כאן",
    "additional_field": "ערך נוסף"
  },
  "result": {
    "finalResponse": "התוצאה המעובדת כאן",
    "tokenCount": 1234
  }
}
``` 