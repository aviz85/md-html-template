#!/bin/bash

echo "Uploading audio file..."
# Upload a test audio file and get job ID
JOB_ID=$(curl -s -X POST https://fdecrxcxrshebgrmbywz.supabase.co/functions/v1/process-tasks \
  -H "Content-Type: multipart/form-data" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkZWNyeGN4cnNoZWJncm1ieXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNjI0MDYwNSwiZXhwIjoyMDUxODE2NjA1fQ.2_MrnURmGA1jyzLlEbylch_jdjFPOmQ_9orXRSvCdfU" \
  -F "file=@./audio.mp3" \
  -F "preferredLanguage=he" \
  -F "proofreadingContext=This is a test transcription" | jq -r '.jobId')

echo "Job ID: $JOB_ID"

# Check status every 5 seconds
while true; do
  echo "Checking status..."
  STATUS=$(curl -s -X GET "https://fdecrxcxrshebgrmbywz.supabase.co/functions/v1/process-tasks?jobId=$JOB_ID" \
    -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkZWNyeGN4cnNoZWJncm1ieXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNjI0MDYwNSwiZXhwIjoyMDUxODE2NjA1fQ.2_MrnURmGA1jyzLlEbylch_jdjFPOmQ_9orXRSvCdfU")
  
  echo "$STATUS" | jq '.'
  
  if [[ $(echo "$STATUS" | jq -r '.status') == "completed" ]]; then
    break
  fi
  
  sleep 5
done 