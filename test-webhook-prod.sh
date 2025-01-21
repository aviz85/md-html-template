#!/bin/bash

# יצירת submission ID ייחודי על בסיס timestamp
SUBMISSION_ID=$(date +%s%N | cut -b1-19)

curl -X POST 'https://md-html-template.vercel.app/api/jotform-results' \
  -H 'accept: */*' \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode "submissionID=$SUBMISSION_ID" \
  --data-urlencode "formID=250192041974051" \
  --data-urlencode 'rawRequest={"q26_input26":"אביץ מאיר","q4_JJ":"avizmaeir@gmail.com","q20_input20":"זכר","q8_input8":"0503973736","q9_input9":"עייפןת","q10_ltstronggt10":"חרדה","q28_input28":"לא יודע"}' 

echo "Sent with submissionID: $SUBMISSION_ID" 