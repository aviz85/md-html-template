#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# Set template ID and URL
TEMPLATE_ID="1hKt-OyUa-_01MzMJnw_Xa6lo-XizF4HJPH6aVSbcgBU"
LOCAL_URL="http://localhost:3000/api/convert"

# Create test_results directory if it doesn't exist
mkdir -p test_results

# Function to run test and check response
run_test() {
  local test_name="$1"
  local test_data="$2"
  local test_file="test_results/${test_name// /_}.json"
  
  echo -e "\nRunning test: ${test_name}"
  
  # Send request and capture response
  response=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "$test_data" \
    -w "%{http_code}" \
    "$LOCAL_URL")
  
  # Extract status code (last 3 characters)
  status_code="${response: -3}"
  # Extract response body (everything except last 3 characters)
  body="${response:0:${#response}-3}"
  
  # Save response to file
  echo "$body" > "$test_file"
  
  # Check status code
  if [[ "$status_code" != "200" ]]; then
    echo -e "${RED}✗ Test failed: API request failed with status $status_code${NC}"
    echo "Response: $body"
    return 1
  fi
  
  # Parse filenames from response
  html_file=$(echo "$body" | jq -r '.files[0].htmlFilename')
  pdf_file=$(echo "$body" | jq -r '.files[0].pdfFilename')
  
  # Check if files exist
  if [[ -f "htmls/$html_file" && -f "pdfs/$pdf_file" ]]; then
    echo -e "${GREEN}✓ Test passed: Files generated successfully${NC}"
    echo "HTML: htmls/$html_file"
    echo "PDF: pdfs/$pdf_file"
    return 0
  else
    echo -e "${RED}✗ Test failed: Generated files not found${NC}"
    echo "Expected HTML: htmls/$html_file"
    echo "Expected PDF: pdfs/$pdf_file"
    return 1
  fi
}

# Test 1: Comprehensive Hebrew test
echo "Starting Hebrew API tests..."
test1_data='{
  "markdowns": [
    "# אבחון אישיות - פרויקט 252\n\n## פתיחה\nברוכים הבאים לאבחון האישי שלכם.\n\n### מטרות האבחון\n- הבנת דפוסי התנהגות\n- זיהוי חוזקות\n- **תחומי שיפור**\n\n#### תוצאות\nהאבחון מראה *תוצאות מעניינות* בתחומים הבאים:\n1. תקשורת בינאישית\n2. יכולת הקשבה\n3. אמפתיה",
    "# חלק שני - המלצות\n\n## צעדים להמשך\n- השתתפות בסדנאות\n- תרגול יומי\n- מעקב התקדמות\n\n### סיכום\nתהליך השינוי מתחיל בצעד הראשון."
  ],
  "template_id": "'$TEMPLATE_ID'"
}'
run_test "Comprehensive Hebrew test" "$test1_data"

# Test 2: Hebrew with special styling
test2_data='{
  "markdowns": "# דוח מיוחד 🌟\n\n## כותרת משנה עם סגנון\nטקסט רגיל עם **הדגשה** ו*הטיה*.\n\n### רשימות מיוחדות\n1. פריט ראשון\n   - תת פריט\n   - עוד תת פריט\n2. פריט שני\n\n#### סיכום\nסיכום עם `קוד` ו~~טקסט מחוק~~",
  "template_id": "'$TEMPLATE_ID'"
}'
run_test "Hebrew with special styling" "$test2_data"

echo -e "\nAll tests completed. Results saved in test_results/" 