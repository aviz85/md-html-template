# Audio Transcription and Proofreading System

## Overview
A system for transcribing audio files and performing intelligent proofreading using AI services. Built on Vercel and Supabase infrastructure with a robust task queue management system.

## System Components

### Infrastructure
- **Vercel**: Hosting and Edge Functions
- **Supabase**: Database and Storage
- **External Services**: 
  - Groq Whisper for transcription
  - Gemini for proofreading

### Database Schema
```sql
-- Main job table
CREATE TABLE transcription_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status TEXT NOT NULL DEFAULT 'pending',
    original_filename TEXT NOT NULL,
    preferred_language TEXT,
    proofreading_context TEXT,
    storage_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    final_transcription TEXT,
    final_proofread TEXT,
    error TEXT,
    metadata JSONB,
    segments_count INTEGER,
    completed_segments INTEGER DEFAULT 0,
    completed_proofreads INTEGER DEFAULT 0
);

-- Task queue table
CREATE TABLE task_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES transcription_jobs(id),
    task_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error TEXT,
    input_data JSONB,
    output_data JSONB,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    locked_until TIMESTAMPTZ,
    locked_by TEXT
);

-- Create indexes
CREATE INDEX idx_task_queue_status ON task_queue(status);
CREATE INDEX idx_task_queue_priority ON task_queue(priority);
CREATE INDEX idx_task_queue_job_id ON task_queue(job_id);
CREATE INDEX idx_transcription_jobs_status ON transcription_jobs(status);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE transcription_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE task_queue;

-- Add RLS policies as needed
```

## Task Types
- `SAVE_FILE` - Save uploaded file to storage
- `CONVERT_AUDIO` - Convert audio to efficient format
- `SPLIT_AUDIO` - Split audio if needed (creates new TRANSCRIBE tasks)
- `TRANSCRIBE` - Transcribe audio segment
- `MERGE_TRANSCRIPTIONS` - Merge transcribed segments
- `SPLIT_TEXT` - Split text for proofreading if needed
- `PROOFREAD` - Proofread text segment
- `MERGE_PROOFREADS` - Merge proofread segments
- `CLEANUP` - Remove temporary files from storage

## Process Flow

### 1. Initial Request
- **Endpoint**: POST /api/transcribe
- **Parameters**:
  - Audio file (required)
  - Preferred language (optional)
  - Proofreading context (optional)
- **Response**: Job ID for tracking
- **Actions**:
  1. Create job record in `transcription_jobs`
  2. Create initial `SAVE_FILE` task
  3. Return job ID to client

### 2. Task Processing System
1. **Task Queue Management**
   - Tasks are processed based on priority and creation time
   - Each task updates job status upon completion
   - Failed tasks are retried up to max_retries
   - Cron job monitors and resets stuck tasks

2. **Task Dependencies**
   ```typescript
   const taskFlow = {
     SAVE_FILE: ['CONVERT_AUDIO'],
     CONVERT_AUDIO: ['SPLIT_AUDIO'],
     SPLIT_AUDIO: ['TRANSCRIBE'],
     TRANSCRIBE: ['MERGE_TRANSCRIPTIONS'],
     MERGE_TRANSCRIPTIONS: ['SPLIT_TEXT'],
     SPLIT_TEXT: ['PROOFREAD'],
     PROOFREAD: ['MERGE_PROOFREADS'],
     MERGE_PROOFREADS: ['CLEANUP']
   };
   ```

3. **Task States**
   - `pending`: Ready to be processed
   - `locked`: Being processed
   - `completed`: Successfully finished
   - `failed`: Error occurred
   - `retry`: Scheduled for retry

### 3. Job Processing
1. **File Processing**
   - Save file → Convert → Split if needed
   - Each step creates next tasks in queue

2. **Transcription**
   - Parallel processing of segments
   - Results merged after all segments complete

3. **Proofreading**
   - Text split into manageable chunks
   - Parallel processing
   - Final merge and cleanup

### 4. Monitoring and Recovery
1. **Cron Jobs**
   ```typescript
   interface CronJobs {
     // Runs every minute
     checkStuckTasks: {
       condition: "locked_until < NOW() AND status = 'locked'",
       action: "Reset to pending if retry_count < max_retries"
     },
     // Runs every 5 minutes
     cleanupStorage: {
       condition: "status = 'completed' AND cleanup_needed = true",
       action: "Remove temporary files"
     }
   }
   ```

2. **Status Tracking**
   - Detailed status available via API
   - Progress tracking for multi-segment jobs
   - Error reporting and retry status

## API Endpoints

### POST /api/transcribe
```typescript
interface TranscribeRequest {
  file: File;
  preferredLanguage?: string;
  proofreadingContext?: string;
}

interface TranscribeResponse {
  jobId: string;
  status: 'accepted';
}
```

### GET /api/transcribe/:jobId
```typescript
interface TranscriptionStatus {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: {
    totalSegments?: number;
    completedTranscriptions?: number;
    completedProofreads?: number;
    currentPhase: string;
  };
  result?: string;
  error?: string;
}
```

## Technical Considerations

### Task Queue Management
- Optimistic locking for task processing
- Automatic retry mechanism
- Priority-based processing
- Dead letter queue for failed tasks

### Storage Cleanup
- Automatic cleanup after job completion
- Temporary file management
- Failed job cleanup policy

### Performance
- Parallel processing where possible
- Efficient task distribution
- Resource usage monitoring
- Queue depth monitoring

### Error Handling
- Comprehensive error capture
- Automatic retry mechanism
- Manual intervention possibilities
- Error notification system

## Monitoring
- Queue depth monitoring
- Task processing rates
- Error rates and types
- Storage usage tracking
- Processing time metrics 