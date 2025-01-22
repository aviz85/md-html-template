# טיפול במידע מהטופס

## מבנה המידע המתקבל

המידע מגיע מ-JotForm בפורמט JSON עם המבנה הבא:

```json
{
  "formID": "250192041974051",        // מזהה הטופס
  "submissionID": "61336242919199",   // מזהה ההגשה
  "type": "WEB",                      // סוג ההגשה
  "username": "user123",              // שם משתמש
  "formTitle": "שם הטופס",            // כותרת הטופס
  "rawRequest": "...",                // המידע הגולמי מהטופס (JSON string)
  "parsedRequest": {                  // המידע המפורסר מה-rawRequest
    "q26_input26": "שם המשתמש",
    "q4_JJ": "דוא״ל",
    "q20_input20": "מגדר",
    "q9_input9": "תשובה לשאלה 1",
    "q10_ltstronggt10": "תשובה לשאלה 2",
    "q28_input28": "תשובה לשאלה 3"
  }
}
```

## תהליך הטיפול במידע

1. **קבלת המידע**
   - המידע מתקבל ב-endpoint: `/api/jotform-results`
   - תמיכה בשני סוגי Content-Type:
     - `application/json`
     - `multipart/form-data`

2. **שמירת מידע גולמי**
   - כל בקשה נשמרת בטבלת `raw_submissions`
   - כולל:
     - Headers
     - Body גולמי
     - Content-Type
     - המידע המפורסר

3. **חילוץ מזהים**
   - `form_id`: מחולץ לפי הסדר הבא:
     ```typescript
     formData.formID || formData.raw?.formID || formData.metadata?.form_id
     ```
   - `submission_id`: מחולץ לפי הסדר הבא:
     ```typescript
     formData.submissionID || formData.raw?.submissionID || formData.metadata?.submission_id
     ```

4. **הכנת המידע לשמירה**
   ```typescript
   const content = {
     form_data: parsedFields,      // המידע המפורסר מהטופס
     metadata: {                   // מטא-דאטה
       submission_id: submissionId,
       form_id: formId
     },
     raw: formData                 // המידע הגולמי המלא
   };
   ```

5. **שמירה בדאטהבייס**
   - טבלת `form_submissions`:
     ```sql
     submission_id: string   -- מזהה ההגשה (not null)
     form_id: string        -- מזהה הטופס (not null)
     content: jsonb         -- תוכן ההגשה
     status: string         -- סטטוס העיבוד (pending/completed/error)
     ```

## טיפול בשגיאות

1. **חוסר ב-form_id**
   - מחזיר שגיאה 400
   - מתעד את כל המידע שהתקבל בלוגים

2. **שגיאת פרסור**
   - אם הפרסור של `rawRequest` נכשל:
     - שומר את המידע הגולמי כמו שהוא
     - ממשיך בתהליך העיבוד

3. **שגיאת דאטהבייס**
   - מתעד את השגיאה בלוגים
   - מחזיר את השגיאה למשתמש

## דוגמה לשימוש ב-curl

```bash
curl -X POST 'http://localhost:3000/api/jotform-results' \
-H 'Content-Type: application/json' \
-d '{
  "formID": "250192041974051",
  "submissionID": "61336242919199",
  "rawRequest": "{\"q26_input26\":\"שם המשתמש\",\"q4_JJ\":\"test@email.com\"}"
}'
```

## טיפים לדיבוג

1. בדוק את הלוגים ב-Vercel עבור:
   - `Content-Type` של הבקשה
   - תוכן ה-`formData` אחרי הפרסור
   - ערכי `form_id` ו-`submission_id`

2. בדוק את טבלת `raw_submissions` לראות את המידע הגולמי המלא

3. וודא שה-`form_id` וה-`submission_id` תואמים בין הבקשה לדאטהבייס 