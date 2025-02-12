# מדריך אינטגרציית Webhook

## מבוא
מערכת הטפסים שלנו מאפשרת לכם לקבל עדכונים בזמן אמת על הגשות טפסים חדשות דרך webhook. המדריך הזה יסביר כיצד להגדיר ולהשתמש באינטגרציה.

## הגדרת Webhook
1. היכנסו למערכת ניהול התבניות
2. בחרו את התבנית הרצויה
3. בהגדרות התבנית, מצאו את שדה "Webhook URL"
4. הכניסו את כתובת ה-URL שתקבל את העדכונים

## מבנה המידע שנשלח
בכל פעם שמתקבלת הגשה חדשה, המערכת תשלח POST request לכתובת שהגדרתם עם המידע הבא:

```json
{
  "form": {
    "id": "מזהה-הטופס",
    "submission_id": "מזהה-ייחודי-להגשה",
    "results_url": "https://md-html-template.vercel.app/results?s=SUBMISSION_ID"
  },
  "customer": {
    "name": "שם הלקוח (אם נמצא בטופס)",
    "email": "אימייל הלקוח (אם נמצא בטופס)",
    "phone": "טלפון הלקוח (אם נמצא בטופס)"
  },
  "form_data": {
    // כל השדות והערכים מהטופס
  },
  "result": {
    "finalResponse": "התוצאה המעובדת",
    "tokenCount": 1234
  }
}
```

## שדות חשובים
- **form.id**: מזהה הטופס ב-JotForm
- **form.submission_id**: מזהה ייחודי להגשה זו
- **form.results_url**: קישור ישיר לצפייה בתוצאות
- **customer**: פרטי הלקוח שזוהו אוטומטית מהטופס
- **form_data**: כל הנתונים שהוגשו בטופס
- **result**: תוצאות העיבוד הסופיות

## אינטגרציה עם Make.com
1. צרו סנריו חדש ב-Make.com
2. הוסיפו מודול "Webhook" כטריגר
3. העתיקו את כתובת ה-Webhook שנוצרה
4. הדביקו את הכתובת בהגדרות התבנית
5. הגדירו את מבנה המידע לפי הדוגמה הבאה:
```json
{
  "form": {
    "id": "{{1.form.id}}",
    "submission_id": "{{1.form.submission_id}}",
    "results_url": "{{1.form.results_url}}"
  },
  "customer": {
    "name": "{{1.customer.name}}",
    "email": "{{1.customer.email}}",
    "phone": "{{1.customer.phone}}"
  }
}
```

## טיפול בתוצאות
1. אפשר להשתמש ב-`results_url` כדי להפנות את הלקוח ישירות לדף התוצאות
2. ניתן לשמור את התוצאות במערכת שלכם דרך שדה `result.finalResponse`
3. אפשר לעקוב אחרי סטטוס העיבוד דרך קריאות API נפרדות

## דוגמה לשימוש ב-Node.js
```javascript
app.post('/webhook', async (req, res) => {
  const { form, customer, result } = req.body;
  
  // שמירת התוצאות במערכת שלכם
  await saveToDatabase({
    submissionId: form.submission_id,
    customerName: customer.name,
    customerEmail: customer.email,
    result: result.finalResponse,
    resultsUrl: form.results_url
  });
  
  res.status(200).send('OK');
});
```

## אבטחה
- הקפידו לאבטח את נקודת הקצה שמקבלת את ה-webhook
- מומלץ לוודא שהמידע מגיע מהמערכת שלנו
- שמרו על סודיות ה-URL של ה-webhook

## תמיכה
אם נתקלתם בבעיות או יש לכם שאלות נוספות, אנא פנו לצוות התמיכה שלנו. 