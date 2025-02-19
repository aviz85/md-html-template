#!/bin/bash

echo "Starting task processing worker..."

while true; do
  curl -s -X POST https://fdecrxcxrshebgrmbywz.supabase.co/functions/v1/process-tasks \
    -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkZWNyeGN4cnNoZWJncm1ieXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNjI0MDYwNSwiZXhwIjoyMDUxODE2NjA1fQ.2_MrnURmGA1jyzLlEbylch_jdjFPOmQ_9orXRSvCdfU" \
    -H "Content-Type: application/json" \
    -d '{}' \
    | jq '.'

  sleep 2
done 