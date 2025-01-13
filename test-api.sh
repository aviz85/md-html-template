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

# Local tests
echo -e "${BLUE}Running local tests...${NC}\n"

run_test "Local" "Test 1: Root level template_id with array" "$ARRAY_DATA" "$LOCAL_URL"
run_test "Local" "Test 2: Root level template_id with single string" "$SINGLE_DATA" "$LOCAL_URL"
run_test "Local" "Test 3: Root level template_id with CTA" "$CTA_DATA" "$LOCAL_URL"
run_test "Local" "Test 4: Template object with template_id and array" "$ARRAY_TEMPLATE_DATA" "$LOCAL_URL"
run_test "Local" "Test 5: Template object with id and single string" "$SINGLE_TEMPLATE_DATA" "$LOCAL_URL"
run_test "Local" "Test 6: Template object with template_id and CTA" "$CTA_TEMPLATE_DATA" "$LOCAL_URL"

# Vercel tests
echo -e "${BLUE}Running Vercel tests...${NC}\n"

run_test "Vercel" "Test 1: Root level template_id with array" "$ARRAY_DATA" "$VERCEL_URL"
run_test "Vercel" "Test 2: Root level template_id with single string" "$SINGLE_DATA" "$VERCEL_URL"
run_test "Vercel" "Test 3: Root level template_id with CTA" "$CTA_DATA" "$VERCEL_URL"
run_test "Vercel" "Test 4: Template object with template_id and array" "$ARRAY_TEMPLATE_DATA" "$VERCEL_URL"
run_test "Vercel" "Test 5: Template object with id and single string" "$SINGLE_TEMPLATE_DATA" "$VERCEL_URL"
run_test "Vercel" "Test 6: Template object with template_id and CTA" "$CTA_TEMPLATE_DATA" "$VERCEL_URL"

echo -e "${GREEN}All tests completed!${NC}" 