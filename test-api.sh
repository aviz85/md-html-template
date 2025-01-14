#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

TEMPLATE_ID="1hKt-OyUa-_01MzMJnw_Xa6lo-XizF4HJPH6aVSbcgBU"
LOCAL_URL="http://localhost:3000/api/convert"
VERCEL_URL="https://md-html-template.vercel.app/api/convert"

run_test() {
    local env=$1
    local test_name=$2
    local data=$3
    local api_url=$4

    echo -e "${BLUE}Testing in $env environment:${NC}"
    echo -e "${GREEN}$test_name${NC}"
    curl -X POST $api_url \
      -H "Content-Type: application/json" \
      -d "$data"
    echo -e "\n\n"
}

echo -e "${GREEN}Starting API tests...${NC}\n"

# Test data
ARRAY_DATA="{
    \"markdowns\": [
      \"# Document 1\\n\\nFirst content\\n\\n- Item 1.1\\n- Item 1.2\",
      \"# Document 2\\n\\nSecond content\\n\\n- Item 2.1\\n- Item 2.2\"
    ],
    \"template_id\": \"$TEMPLATE_ID\"
  }"

SINGLE_DATA="{
    \"markdowns\": \"# Single Document\\n\\nThis is a test\",
    \"template_id\": \"$TEMPLATE_ID\"
  }"

CTA_DATA="{
    \"markdowns\": \"# Test Document\\n\\nThis is a test\\n\\n[CTA]\",
    \"template_id\": \"$TEMPLATE_ID\"
  }"

ARRAY_TEMPLATE_DATA="{
    \"markdowns\": [
      \"# Document 1\\n\\nFirst content\\n\\n- Item 1.1\\n- Item 1.2\",
      \"# Document 2\\n\\nSecond content\\n\\n- Item 2.1\\n- Item 2.2\"
    ],
    \"template\": {
      \"template_id\": \"$TEMPLATE_ID\"
    }
  }"

SINGLE_TEMPLATE_DATA="{
    \"markdowns\": \"# Single Document\\n\\nThis is a test\",
    \"template\": {
      \"id\": \"$TEMPLATE_ID\"
    }
  }"

CTA_TEMPLATE_DATA="{
    \"markdowns\": \"# Test Document\\n\\nThis is a test\\n\\n[CTA]\",
    \"template\": {
      \"template_id\": \"$TEMPLATE_ID\"
    }
  }"

# New test data for templateId and mdContents
TEMPLATE_ID_DATA="{
    \"mdContents\": [
      \"# Document 1\\n\\nFirst content\\n\\n- Item 1.1\\n- Item 1.2\",
      \"# Document 2\\n\\nSecond content\\n\\n- Item 2.1\\n- Item 2.2\"
    ],
    \"templateId\": \"$TEMPLATE_ID\"
  }"

TEMPLATE_ID_SINGLE_DATA="{
    \"mdContents\": \"# Single Document\\n\\nThis is a test\",
    \"templateId\": \"$TEMPLATE_ID\"
  }"

TEMPLATE_ID_CTA_DATA="{
    \"mdContents\": \"# Test Document\\n\\nThis is a test\\n\\n[CTA]\",
    \"templateId\": \"$TEMPLATE_ID\"
  }"

# Test with template.id using sheet_id
SHEET_ID_TEMPLATE_DATA="{
    \"markdowns\": [
      \"# Test Header\",
      \"## Second header\\nSome content\"
    ],
    \"template\": {
      \"id\": \"1hKt-OyUa-_01MzMJnw_Xa6lo-XizF4HJPH6aVSbcgBU\"
    }
  }"

# Test with backticks splitting
BACKTICKS_DATA="{
    \"markdowns\": \"Regular text `````First Document`````\\nMore text `````Second Document`````\\nEnd text\",
    \"template_id\": \"$TEMPLATE_ID\"
  }"

BACKTICKS_ARRAY_DATA="{
    \"markdowns\": [
      \"Text with `````First Split`````\",
      \"Another text `````Second Split`````\"
    ],
    \"template_id\": \"$TEMPLATE_ID\"
  }"

MULTIPLE_BACKTICKS_IN_STRING="{
    \"markdowns\": \"Start text `````First Doc`````\\nMiddle text `````Second Doc`````\\nMore text `````Third Doc`````\\nAnd `````Fourth Doc`````\\nEnd text\",
    \"template_id\": \"$TEMPLATE_ID\"
  }"

# Test array with mixed content - some strings with backticks, some without
MIXED_ARRAY_DATA='{
  "template_id": "1FnBxuZQZnIxZy2JDyxr-uR7JR7hqQUvEJVhNcgX_Ono",
  "markdowns": [
    "First normal string",
    "Some text `````Split content 1````` more text `````Split content 2````` end text",
    "Last normal string"
  ]
}'

# Local tests
echo -e "${BLUE}Running local tests...${NC}\n"

run_test "Local" "Test 1: Root level template_id with array" "$ARRAY_DATA" "$LOCAL_URL"
run_test "Local" "Test 2: Root level template_id with single string" "$SINGLE_DATA" "$LOCAL_URL"
run_test "Local" "Test 3: Root level template_id with CTA" "$CTA_DATA" "$LOCAL_URL"
run_test "Local" "Test 4: Template object with template_id and array" "$ARRAY_TEMPLATE_DATA" "$LOCAL_URL"
run_test "Local" "Test 5: Template object with id and single string" "$SINGLE_TEMPLATE_DATA" "$LOCAL_URL"
run_test "Local" "Test 6: Template object with template_id and CTA" "$CTA_TEMPLATE_DATA" "$LOCAL_URL"
run_test "Local" "Test 7: Root level templateId with array" "$TEMPLATE_ID_DATA" "$LOCAL_URL"
run_test "Local" "Test 8: Root level templateId with single string" "$TEMPLATE_ID_SINGLE_DATA" "$LOCAL_URL"
run_test "Local" "Test 9: Root level templateId with CTA" "$TEMPLATE_ID_CTA_DATA" "$LOCAL_URL"
run_test "Local" "Test 10: Template.id with sheet_id" "$SHEET_ID_TEMPLATE_DATA" "$LOCAL_URL"
run_test "Local" "Test 11: Single string with backticks" "$BACKTICKS_DATA" "$LOCAL_URL"
run_test "Local" "Test 12: Array with backticks" "$BACKTICKS_ARRAY_DATA" "$LOCAL_URL"
run_test "Local" "Test 13: Multiple backticks in single string" "$MULTIPLE_BACKTICKS_IN_STRING" "$LOCAL_URL"
run_test "Local" "Test 14: Array with mixed backticks content" "$MIXED_ARRAY_DATA" "$LOCAL_URL"

# Vercel tests
echo -e "${BLUE}Running Vercel tests...${NC}\n"

run_test "Vercel" "Test 1: Root level template_id with array" "$ARRAY_DATA" "$VERCEL_URL"
run_test "Vercel" "Test 2: Root level template_id with single string" "$SINGLE_DATA" "$VERCEL_URL"
run_test "Vercel" "Test 3: Root level template_id with CTA" "$CTA_DATA" "$VERCEL_URL"
run_test "Vercel" "Test 4: Template object with template_id and array" "$ARRAY_TEMPLATE_DATA" "$VERCEL_URL"
run_test "Vercel" "Test 5: Template object with id and single string" "$SINGLE_TEMPLATE_DATA" "$VERCEL_URL"
run_test "Vercel" "Test 6: Template object with template_id and CTA" "$CTA_TEMPLATE_DATA" "$VERCEL_URL"
run_test "Vercel" "Test 7: Root level templateId with array" "$TEMPLATE_ID_DATA" "$VERCEL_URL"
run_test "Vercel" "Test 8: Root level templateId with single string" "$TEMPLATE_ID_SINGLE_DATA" "$VERCEL_URL"
run_test "Vercel" "Test 9: Root level templateId with CTA" "$TEMPLATE_ID_CTA_DATA" "$VERCEL_URL"
run_test "Vercel" "Test 10: Template.id with sheet_id" "$SHEET_ID_TEMPLATE_DATA" "$VERCEL_URL"
run_test "Vercel" "Test 11: Single string with backticks" "$BACKTICKS_DATA" "$VERCEL_URL"
run_test "Vercel" "Test 12: Array with backticks" "$BACKTICKS_ARRAY_DATA" "$VERCEL_URL"
run_test "Vercel" "Test 13: Multiple backticks in single string" "$MULTIPLE_BACKTICKS_IN_STRING" "$VERCEL_URL"
run_test "Vercel" "Test 14: Array with mixed backticks content" "$MIXED_ARRAY_DATA" "$VERCEL_URL"

echo -e "${GREEN}All tests completed!${NC}" 