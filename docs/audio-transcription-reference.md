# Audio Transcription API Documentation

## Overview
The Supabase Edge Function provides an API for transcribing audio files to text, optimized for Hebrew transcription using Groq's API.

## Base URL
```
https://fdecrxcxrshebgrmbywz.supabase.co/functions/v1/process-tasks
```

## Authentication
All requests require a Supabase service role key in the Authorization header:
```bash
Authorization: Bearer your-supabase-service-role-key
```

## Endpoints

### Start Transcription

Initiates an audio file transcription.

```http
POST /functions/v1/process-tasks
```

#### Request Body
```json
{
  "url": "https://example.com/audio.wav",
  "preferredLanguage": "he"
}
```

| Field | Type | Description |
|-------|------|-------------|
| url | string | **Required**. Public URL of the audio file |
| preferredLanguage | string | **Optional**. Language code (default: "he") |

#### Response
```json
{
  "jobId": "123e4567-e89b-12d3-a456-426614174000",
  "status": "processing"
}
```

### Check Transcription Status

Retrieves the status and result of a transcription job.

```http
GET /functions/v1/process-tasks?jobId={jobId}
```

#### Response
```json
{
  "jobId": "123e4567-e89b-12d3-a456-426614174000",
  "status": "completed",
  "result": "התמלול בעברית כאן...",
  "error": null
}
```

## Usage Examples

### cURL
```bash
# Start transcription
curl -X POST "https://fdecrxcxrshebgrmbywz.supabase.co/functions/v1/process-tasks" \
  -H "Authorization: Bearer your-service-role-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.jotform.com/uploads/user/audio.wav",
    "preferredLanguage": "he"
  }'

# Check status
curl "https://fdecrxcxrshebgrmbywz.supabase.co/functions/v1/process-tasks?jobId=your-job-id" \
  -H "Authorization: Bearer your-service-role-key"
```

### JavaScript/TypeScript
```typescript
const transcribeAudio = async (audioUrl: string): Promise<string> => {
  // Start transcription
  const response = await fetch(
    'https://fdecrxcxrshebgrmbywz.supabase.co/functions/v1/process-tasks',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: audioUrl,
        preferredLanguage: 'he'
      })
    }
  );

  const { jobId } = await response.json();

  // Poll for completion
  while (true) {
    const statusResponse = await fetch(
      `https://fdecrxcxrshebgrmbywz.supabase.co/functions/v1/process-tasks?jobId=${jobId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );

    const status = await statusResponse.json();
    
    if (status.status === 'completed') {
      return status.result;
    }
    
    if (status.status === 'failed') {
      throw new Error(status.error);
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }
};
```

## Status Codes & Errors

### HTTP Status Codes
| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request |
| 401 | Unauthorized |
| 404 | Job Not Found |
| 500 | Server Error |

### Job Status Values
| Status | Description |
|--------|-------------|
| processing | Job is being processed |
| completed | Transcription is complete |
| failed | Transcription failed |

### Error Responses
```json
{
  "error": "Error message description"
}
```

Common errors:
- "Invalid URL provided"
- "Failed to download file"
- "File type not supported"
- "File too large"
- "Transcription failed"

## Limitations
- Maximum file size: 100MB
- Supported formats: .mp3, .wav, .mp4
- Maximum duration: 4 hours
- Rate limit: 100 requests per minute
- Job timeout: 5 minutes

## Best Practices
1. Always check if the URL is publicly accessible
2. Include error handling for network issues
3. Implement exponential backoff for status checks
4. Store the jobId for later reference
5. Handle timeout cases appropriately

## Testing
Use the provided test script:
```bash
./test-edge-function.sh
```

Or test with a sample audio file:
```bash
curl -X POST "https://fdecrxcxrshebgrmbywz.supabase.co/functions/v1/process-tasks" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.jotform.com/uploads/test/audio-sample.wav",
    "preferredLanguage": "he"
  }'
```