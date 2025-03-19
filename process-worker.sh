#!/bin/bash

# Generate a unique worker ID
WORKER_ID=$(uuidgen || date +%s)
echo "Starting task processing worker with ID: $WORKER_ID..."

while true; do
  curl -s -X POST https://fdecrxcxrshebgrmbywz.supabase.co/functions/v1/process-tasks \
    -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkZWNyeGN4cnNoZWJncm1ieXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNjI0MDYwNSwiZXhwIjoyMDUxODE2NjA1fQ.2_MrnURmGA1jyzLlEbylch_jdjFPOmQ_9orXRSvCdfU" \
    -H "Content-Type: application/json" \
    -d "{\"worker_id\": \"$WORKER_ID\"}" \
    | jq '.'

  # Increase sleep time to reduce chance of overlapping executions
  # Random component to stagger workers if multiple are running
  SLEEP_TIME=$(( 5 + ( RANDOM % 3 ) ))
  echo "Sleeping for $SLEEP_TIME seconds..."
  sleep $SLEEP_TIME
done 