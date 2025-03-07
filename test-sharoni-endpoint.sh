#!/bin/bash

# Define colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Define the endpoint - change to your actual deployment URL when deployed
LOCAL_URL="http://localhost:3000/api/sharoni"
PROD_URL="https://YOUR-VERCEL-URL.vercel.app/api/sharoni"

# Default to the local URL unless PROD is specified
URL=$LOCAL_URL
if [ "$1" == "prod" ]; then
  URL=$PROD_URL
  echo "Testing production endpoint: $URL"
else
  echo "Testing local endpoint: $URL"
fi

# Example JotForm submission data in JSON format
echo -e "${GREEN}Sending test data to Sharoni endpoint...${NC}"

curl -X POST $URL \
  -H "Content-Type: application/json" \
  -d '{
    "formID": "test_form_id",
    "submissionID": "test_submission_123",
    "rawRequest": "{\"q3_name\":{\"text\":\"שם מלא\",\"answer\":\"שרוני ישראלי\"},\"q4_email\":{\"text\":\"מייל\",\"answer\":\"sharoni@example.com\"},\"q5_phone\":{\"text\":\"טלפון\",\"answer\":\"0501234567\"},\"q6_birthdate\":{\"text\":\"תאריך לידה\",\"answer\":\"1990-01-01\"}}",
    "parsedRequest": {
      "q3_name": {
        "text": "שם מלא",
        "answer": "שרוני ישראלי"
      },
      "q4_email": {
        "text": "מייל", 
        "answer": "sharoni@example.com"
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