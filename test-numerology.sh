#!/bin/bash

# Function to test a date and extract results
test_date() {
    local date=$1
    echo "🔄 Testing birth date: $date"
    
    result=$(curl -s -X POST 'https://md-html-template.vercel.app/api/birth-date-numerology' \
    -H 'Content-Type: application/json' \
    -d "{
      \"form_data\": {
        \"birth_date\": \"$date\",
        \"name\": \"ישראל ישראלי\",
        \"email\": \"test@example.com\"
      },
      \"transcription\": \"תאריך לידה $date\"
    }")
    
    # Extract values using jq
    essence_num=$(echo $result | jq -r '.form_data.essence_number')
    essence_name=$(echo $result | jq -r '.form_data.essence_name')
    quality_num=$(echo $result | jq -r '.form_data.quality_number')
    quality_name=$(echo $result | jq -r '.form_data.quality_name')
    
    echo "$date|$essence_num|$essence_name|$quality_num|$quality_name" >> results.txt
}

# Clear previous results
echo "תאריך|מספר מהות|שם מהות|מספר איכות|שם איכות" > results.txt
echo "---|---|---|---|---" >> results.txt

# Test different date formats
test_date "01.01.1990"
test_date "1.1.1990"
test_date "05.05.1985"
test_date "5.5.1985"
test_date "23.12.1995"
test_date "03.07.2000"
test_date "3.7.2000"
test_date "15.10.1988"
test_date "08.08.1978"
test_date "8.8.1978"

echo "📊 Results in Markdown format:"
cat results.txt 