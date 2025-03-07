#!/bin/bash

# Define colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Define the endpoint - change to your actual deployment URL when deployed
LOCAL_URL="http://localhost:3000/api/jotform-to-sendmsg"
PROD_URL="https://YOUR-VERCEL-URL.vercel.app/api/jotform-to-sendmsg"

# Default to the local URL unless PROD is specified
URL=$LOCAL_URL
if [ "$1" == "prod" ]; then
  URL=$PROD_URL
  echo "Testing production endpoint: $URL"
else
  echo "Testing local endpoint: $URL"
fi

# Example JotForm submission data in JSON format
echo -e "${GREEN}Sending JotForm test data to endpoint...${NC}"

curl -X POST $URL \
  -H "Content-Type: application/json" \
  -d '{
    "formID": "test_form_id",
    "submissionID": "test_submission_123",
    "rawRequest": "{\"q3_name\":{\"text\":\"שם מלא\",\"answer\":\"ישראל ישראלי\"},\"q4_email\":{\"text\":\"מייל\",\"answer\":\"test@example.com\"},\"q5_phone\":{\"text\":\"טלפון\",\"answer\":\"0501234567\"},\"q6_birthdate\":{\"text\":\"תאריך לידה\",\"answer\":\"1990-01-01\"}}",
    "parsedRequest": {
      "q3_name": {
        "text": "שם מלא",
        "answer": "ישראל ישראלי"
      },
      "q4_email": {
        "text": "מייל", 
        "answer": "test@example.com"
      },
      "q5_phone": {
        "text": "טלפון",
        "answer": "0501234567"
      },
      "q6_birthdate": {
        "text": "תאריך לידה",
        "answer": "1990-01-01"
      }
    }
  }'

echo -e "\n${GREEN}Test completed!${NC}" 