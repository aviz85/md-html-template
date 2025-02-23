# Transcription API Reference

## Overview
The Transcription API provides a service for converting audio files to text, optimized for Hebrew speech recognition. It supports various audio formats, handles large files efficiently, and includes automatic proofreading capabilities.

## Base URL
```
http://md-html-template.vercel.app/api/transcribe
```

## Authentication
The API uses token-based authentication. You'll need to obtain an API key to use the service.

### Authentication Header
Include your API key in the Authorization header:

```bash
Authorization: Bearer <your-api-key>
```

To obtain an API key, contact our support team.

## Endpoints

### Start Transcription
Initiates a new transcription job.

**Endpoint:** `POST /api/transcribe`

**Content-Type:** `multipart/form-data`

**Request Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| file | File | Yes | Audio file to transcribe |
| preferredLanguage | string | No | Preferred language (default: 'he') |
| proofreadingContext | string | No | Additional context to improve proofreading accuracy (e.g., technical terms, names) |
| metadata | JSON | No | Additional metadata for the job |

**Metadata Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| disable_proofread | boolean | false | Set to true to skip the proofreading phase |

**Supported Audio Formats:**
- WAV
- MP3
- MP4
- OGG
- WebM
- M4A
- AAC

**Example Requests:**

1. Basic transcription with default proofreading:
```bash
curl -X POST "http://md-html-template.vercel.app/api/transcribe" \
  -H "Authorization: Bearer your-api-key" \
  -F "file=@audio.wav" \
  -F "preferredLanguage=he"
```

2. Transcription with context for better proofreading:
```bash
curl -X POST "http://md-html-template.vercel.app/api/transcribe" \
  -H "Authorization: Bearer your-api-key" \
  -F "file=@audio.wav" \
  -F "preferredLanguage=he" \
  -F "proofreadingContext=Technical discussion about React and TypeScript"
```

3. Transcription without proofreading:
```bash
curl -X POST "http://md-html-template.vercel.app/api/transcribe" \
  -H "Authorization: Bearer your-api-key" \
  -F "file=@audio.wav" \
  -F "metadata={\"disable_proofread\": true}"
```

**Response:**
```json
{
  "jobId": "job_123abc",
  "status": "accepted",
  "hasProofread": false,
  "proofreadAttempted": true
}
```

### Check Transcription Status
Retrieves the status and result of a transcription job.

**Endpoint:** `GET /api/transcribe`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| jobId | string | Yes | ID of the transcription job |

**Example Request:**
```bash
curl "http://md-html-template.vercel.app/api/transcribe?jobId=job_123abc" \
  -H "Authorization: Bearer your-api-key"
```

**Response:**
```json
{
  "jobId": "job_123abc",
  "status": "completed",
  "result": "התמלול המתוקן...",  // Proofread version if available, otherwise original
  "transcription": "התמלול המקורי...",  // Original transcription
  "proofread": "התמלול המתוקן...",  // Proofread version if available, null otherwise
  "error": null
}
```

## Proofreading Process
The API includes an automatic proofreading phase that:
1. Runs by default unless explicitly disabled
2. Improves text organization and readability
3. Fixes obvious spelling mistakes
4. Adds proper punctuation
5. Can use provided context to better understand technical terms

To disable proofreading, set `disable_proofread: true` in the metadata. If proofreading fails for any reason, the API will automatically fall back to the original transcription without interrupting the process.

## Best Practices
1. **Proofreading Context:**
   - Provide context for technical discussions
   - Include specific terms or names that might appear
   - Mention the general topic or field

2. **When to Disable Proofreading:**
   - For raw, unprocessed transcriptions
   - When speed is more important than formatting
   - For testing or debugging purposes

## Status Values
| Status | Description |
|--------|-------------|
| accepted | Job was accepted and is queued |
| processing | Job is currently being processed |
| completed | Transcription is complete |
| failed | Transcription failed |

## Progress Phases
| Phase | Description |
|-------|-------------|
| Saving file | Initial file upload |
| Converting audio | Converting to MP3 format |
| Splitting audio | Preparing audio segments |
| Transcribing | Converting speech to text |
| Merging transcriptions | Combining segments |
| Proofreading | Improving accuracy |
| Finalizing | Final processing |
| Completed | Process complete |

## Error Handling

### HTTP Status Codes
| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request |
| 401 | Unauthorized |
| 404 | Job Not Found |
| 413 | File Too Large |
| 415 | Unsupported Media Type |
| 500 | Server Error |

### Error Response Format
```json
{
  "error": "Error message here",
  "details": {
    "code": "ERROR_CODE",
    "message": "Detailed error message"
  }
}
```

## File Specifications
- Maximum file size: 500MB
- Recommended format: MP3
- Optimal audio settings:
  - Bitrate: 96kbps
  - Sample rate: 22.05kHz
  - Channels: Stereo
  - Format: MP3

## Rate Limiting
- 100 requests per minute per API key
- 10 concurrent transcription jobs per account
- Maximum audio duration: 4 hours

## Best Practices
1. **File Preparation:**
   - Remove silence and background noise
   - Ensure clear audio quality
   - Use recommended format when possible

2. **Optimal Usage:**
   - Poll status endpoint every 5-10 seconds
   - Implement exponential backoff for status checks
   - Store jobId for future reference

3. **Error Handling:**
   - Implement retry logic for failed requests
   - Handle timeouts appropriately
   - Validate file format before upload

## Code Examples

### Node.js
```javascript
const formData = new FormData();
formData.append('file', fs.createReadStream('audio.wav'));
formData.append('preferredLanguage', 'he');

const response = await fetch('http://md-html-template.vercel.app/api/transcribe', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`
  },
  body: formData
});

const { jobId } = await response.json();

// Poll for results
const checkStatus = async () => {
  const statusResponse = await fetch(
    `http://md-html-template.vercel.app/api/transcribe?jobId=${jobId}`,
    {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    }
  );
  return await statusResponse.json();
};
```

### Python
```python
import requests

files = {
    'file': open('audio.wav', 'rb'),
    'preferredLanguage': (None, 'he')
}

response = requests.post(
    'http://md-html-template.vercel.app/api/transcribe',
    headers={'Authorization': f'Bearer {api_key}'},
    files=files
)

job_id = response.json()['jobId']

# Poll for results
def check_status(job_id):
    return requests.get(
        f'http://md-html-template.vercel.app/api/transcribe?jobId={job_id}',
        headers={'Authorization': f'Bearer {api_key}'}
    ).json()
```

## Webhook Integration
For long-running transcriptions, you can provide a webhook URL to receive notifications when the transcription is complete.

**Webhook Payload:**
```json
{
  "jobId": "job_123abc",
  "status": "completed",
  "result": "התמלול כאן...",
  "metadata": {
    "duration": 300,
    "wordCount": 500,
    "confidence": 0.95
  }
}
```

## Support
For API support or to report issues:
- Email: support@md-html-template.vercel.app
- Documentation: http://md-html-template.vercel.app/docs
- Status page: http://md-html-template.vercel.app/status 

## Security Notes
- Each user can only access their own transcription jobs
- Files are stored in user-specific paths
- Sessions expire after 24 hours
- Rate limits are per-user
- Failed authentication attempts are logged and may trigger temporary blocks 