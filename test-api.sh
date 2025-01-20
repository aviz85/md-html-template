#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create output directories if they don't exist
mkdir -p htmls pdfs

# Test configuration
TEMPLATE_ID="1hKt-OyUa-_01MzMJnw_Xa6lo-XizF4HJPH6aVSbcgBU"
LOCAL_URL="http://localhost:3000/api/convert"

check_response() {
    local response=$1
    local test_name=$2
    
    # Get status code from last line
    status_code=$(echo "$response" | tail -n1)
    # Get response body without status code
    body=$(echo "$response" | sed \$d)
    
    # Save response body for debugging
    echo "$body" > "test_results/${test_name// /_}.json"
    
    if [ "$status_code" != "200" ]; then
        echo -e "${RED}❌ Failed: $test_name${NC}"
        echo -e "${RED}Status: $status_code${NC}"
        echo -e "${RED}Response: $body${NC}"
        return 1
    fi
    
    # Extract filenames from response
    html_file=$(echo "$body" | jq -r '.files[0].htmlFilename')
    pdf_file=$(echo "$body" | jq -r '.files[0].pdfFilename')
    
    if [ "$html_file" = "null" ] || [ "$pdf_file" = "null" ]; then
        echo -e "${RED}❌ Failed: Could not extract filenames${NC}"
        echo -e "${RED}Response: $body${NC}"
        return 1
    fi
    
    # Verify files exist
    if [ ! -f "htmls/$html_file" ]; then
        echo -e "${RED}❌ Failed: HTML file not found: htmls/$html_file${NC}"
        return 1
    fi
    
    if [ ! -f "pdfs/$pdf_file" ]; then
        echo -e "${RED}❌ Failed: PDF file not found: pdfs/$pdf_file${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓ Passed: $test_name${NC}"
    echo -e "  HTML: $html_file"
    echo -e "  PDF: $pdf_file"
    return 0
}

run_test() {
    local test_name=$1
    local data=$2
    
    echo -e "\n${BLUE}Running test: $test_name${NC}"
    
    # Make API request and save response
    response=$(curl -s -w "\n%{http_code}" -X POST $LOCAL_URL \
        -H "Content-Type: application/json" \
        -d "$data")
    
    check_response "$response" "$test_name"
}

# Create directory for test results
mkdir -p test_results

echo -e "${GREEN}Starting API tests...${NC}\n"

# Test 1: Basic single markdown
run_test "Basic single markdown" '{
    "markdowns": "# Test Document\n\nThis is a basic test.",
    "template_id": "'$TEMPLATE_ID'"
}'

# Test 2: Multiple markdowns array
run_test "Multiple markdowns array" '{
    "markdowns": [
        "# Document 1\n\nFirst content",
        "# Document 2\n\nSecond content"
    ],
    "template_id": "'$TEMPLATE_ID'"
}'

# Test 3: Using mdContents instead of markdowns
run_test "Using mdContents" '{
    "mdContents": "# Test Document\n\nTesting mdContents field",
    "template_id": "'$TEMPLATE_ID'"
}'

# Test 4: Using templateId instead of template_id
run_test "Using templateId" '{
    "markdowns": "# Test Document\n\nTesting templateId field",
    "templateId": "'$TEMPLATE_ID'"
}'

# Test 5: Using template object
run_test "Using template object" '{
    "markdowns": "# Test Document\n\nTesting template object",
    "template": {
        "template_id": "'$TEMPLATE_ID'"
    }
}'

# Test 6: Hebrew content with RTL
run_test "Hebrew content with RTL" '{
    "markdowns": "# כותרת ראשית\n\nטקסט בעברית עם תמיכה ב-RTL",
    "template_id": "'$TEMPLATE_ID'"
}'

# Test 7: Content with special formatting
run_test "Content with special formatting" '{
    "markdowns": "# Formatting Test\n\n**Bold text**\n\n*Italic text*\n\n- List item 1\n- List item 2",
    "template_id": "'$TEMPLATE_ID'"
}'

# Test 8: Multiple pages with opening and closing
run_test "Multiple pages with opening and closing" '{
    "markdowns": [
        "# Page 1\n\nFirst page content",
        "# Page 2\n\nSecond page content",
        "# Page 3\n\nThird page content"
    ],
    "template_id": "'$TEMPLATE_ID'"
}'

# Test 9: Content with custom styles
run_test "Content with custom styles" '{
    "markdowns": "# Styled Header\n\n## Secondary Header\n\n### Third Level\n\nRegular paragraph text",
    "template_id": "'$TEMPLATE_ID'"
}'

# Test 10: Mixed content types
run_test "Mixed content types" '{
    "markdowns": [
        "# Regular Page\n\nStandard content",
        "# Special Page\n\n## Custom Header\n\nWith special formatting",
        "# Final Page\n\nClosing content"
    ],
    "template_id": "'$TEMPLATE_ID'"
}'

# Test 11: Comprehensive Hebrew test
run_test "Comprehensive Hebrew test" '{
    "markdowns": [
        "# אבחון אישיות - פרויקט 252\n\n## פתיחה\nברוכים הבאים לאבחון האישי שלכם.\n\n### מטרות האבחון\n- הבנת דפוסי התנהגות\n- זיהוי חוזקות\n- **תחומי שיפור**\n\n#### תוצאות\nהאבחון מראה *תוצאות מעניינות* בתחומים הבאים:\n1. תקשורת בינאישית\n2. יכולת הקשבה\n3. אמפתיה",
        "# חלק שני - המלצות\n\n## צעדים להמשך\n- השתתפות בסדנאות\n- תרגול יומי\n- מעקב התקדמות\n\n### סיכום\nתהליך השינוי מתחיל בצעד הראשון."
    ],
    "template_id": "'$TEMPLATE_ID'"
}'

# Test 12: Hebrew with special styling
run_test "Hebrew with special styling" '{
    "markdowns": "# דוח מיוחד 🌟\n\n## כותרת משנה עם סגנון\nטקסט רגיל עם **הדגשה** ו*הטיה*.\n\n### רשימות מיוחדות\n1. פריט ראשון\n   - תת פריט\n   - עוד תת פריט\n2. פריט שני\n\n#### סיכום\nסיכום עם `קוד` ו~~טקסט מחוק~~",
    "template_id": "'$TEMPLATE_ID'"
}'

echo -e "\n${GREEN}All tests completed!${NC}"

# Print summary
total_files=$(ls -1 htmls/ | wc -l)
echo -e "\n${BLUE}Summary:${NC}"
echo -e "Total HTML files generated: $total_files"
echo -e "Test results saved in: test_results/" 