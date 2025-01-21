# Form Processing Flow Documentation

## Overview
This system processes form submissions through Claude AI and displays results to users. It consists of three main components:
1. Form submission handling (Jotform)
2. Backend processing (Claude AI)
3. Results display

## Architecture

### Data Flow
1. User submits form → Jotform triggers:
   - Redirects user to results page
   - Sends webhook to our API
   - Sends email with results link (via Jotform)

2. Backend processing:
   - Saves submission to Supabase
   - Fetches prompts from Google Sheets
   - Processes with Claude AI
   - Updates submission status and results

3. Results page:
   - Polls Supabase for status
   - Displays loading/results/error states

## Setup Requirements

### Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ANTHROPIC_API_KEY=your_claude_key
GOOGLE_API_KEY=your_sheets_api_key
```

### Supabase Setup
1. Tables required:
```sql
-- Templates table
CREATE TABLE public.templates (
    id uuid DEFAULT extensions.uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    template_gsheets_id VARCHAR(255),
    form_id text UNIQUE,
    -- other columns...
    CONSTRAINT templates_pkey PRIMARY KEY (id)
);

-- Form submissions table
CREATE TABLE public.form_submissions (
    id uuid DEFAULT gen_random_uuid(),
    form_id text NOT NULL,
    submission_id text NOT NULL,
    content jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    result jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT form_submissions_pkey PRIMARY KEY (id),
    CONSTRAINT form_submissions_form_id_submission_id_key UNIQUE (form_id, submission_id)
);
```

### Google Sheets Setup
1. Create a Google Sheet for prompts
2. Share it publicly (view access)
3. Add prompts in column A
4. Add sheet ID to templates table

### Jotform Setup
1. Configure Thank You page:
   ```
   /results?formId={form_id}&submissionId={submission_id}
   ```

2. Add webhook:
   ```
   POST /api/jotform-results
   ```

3. Configure email notifications (optional)

## API Endpoints

### POST /api/jotform-results
Handles form submissions from Jotform webhook.
- Saves submission to database
- Triggers Claude processing
- Returns HTML response page

### GET /results
Displays results page with real-time updates:
- Shows loading state while processing
- Displays results when complete
- Shows error if processing fails

## Database Schema Details

### Templates Table
- `id`: Unique identifier
- `name`: Template name
- `template_gsheets_id`: Google Sheets ID containing prompts
- `form_id`: Associated Jotform ID

### Form Submissions Table
- `id`: Unique identifier
- `form_id`: Jotform form ID
- `submission_id`: Jotform submission ID
- `content`: Form submission data (JSONB)
- `status`: Processing status (pending/completed/error)
- `result`: Claude AI processing results (JSONB)
- `created_at`: Timestamp
- `updated_at`: Timestamp

## Processing States
- `pending`: Initial state, processing with Claude
- `completed`: Processing finished successfully
- `error`: Processing failed

## Security Considerations
- Supabase RLS policies in place
- Public access limited to necessary operations
- Environment variables for sensitive data
- Google Sheets public access limited to view-only

## Error Handling
- Database errors logged and displayed
- Processing errors update submission status
- User-friendly error messages on results page
- Automatic retry not implemented (manual resubmission required) 