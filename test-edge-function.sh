#!/bin/bash

# Source .env.local file if it exists
if [ -f .env.local ]; then
    export $(cat .env.local | grep -v '^#' | xargs)
else
    echo "Error: .env.local file not found"
    exit 1
fi

# Your Supabase project URL
SUPABASE_URL="https://fdecrxcxrshebgrmbywz.supabase.co"

# Check for service role key
if [ -z "${SUPABASE_SERVICE_ROLE_KEY}" ]; then
    echo "Error: SUPABASE_SERVICE_ROLE_KEY not found in .env.local file"
    exit 1
fi

echo "Testing URL accessibility..."
curl -I "https://www.jotform.com/widget-uploads/voiceRecorder/250422603285450/67b5944bdb887_173995322767b5944be10eb.wav"

echo "Submitting audio URL for transcription..."
RESPONSE=$(curl -X POST "$SUPABASE_URL/functions/v1/process-tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  --data-raw '{
    "url": "https://www.jotform.com/widget-uploads/voiceRecorder/250422603285450/67b5944bdb887_173995322767b5944be10eb.wav",
    "preferredLanguage": "he",
    "proofreadingContext": "This is a test transcription"
  }' \
  -v)

echo "Full Response: $RESPONSE"

# Extract job ID from response
JOB_ID=$(echo $RESPONSE | jq -r '.jobId')

if [ "$JOB_ID" != "null" ] && [ "$JOB_ID" != "" ]; then
  echo "Job ID: $JOB_ID"
  
  # Check status every 5 seconds
  while true; do
    echo "Checking status..."
    STATUS=$(curl -s -X GET "$SUPABASE_URL/functions/v1/process-tasks?jobId=$JOB_ID" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")
    
    echo "$STATUS" | jq '.'
    
    if [[ $(echo "$STATUS" | jq -r '.status') == "completed" ]]; then
      break
    fi
    
    sleep 5
  done
else
  echo "Error: No job ID received"
  echo "Full response: $RESPONSE"
fi 