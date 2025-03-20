// opening-page.html
const openingPage = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=David+Libre:wght@400;500;700&family=Assistant:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    body {
      margin: 0;
      padding: 2rem;
      font-family: 'David Libre', serif;
      line-height: 1.5;
      max-width: 800px;
      margin-left: auto;
      margin-right: auto;
    }

    * {
      box-sizing: border-box;
    }

    @font-face {
      font-family: 'rash';
      src: url('https://fdecrxcxrshebgrmbywz.supabase.co/storage/v1/object/public/fonts/fonts/rash.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
    }

    p { font-family: inherit; }
    h1 { color: #844d88; font-family: inherit; }
    h2 { color: #0e2f5e; font-family: inherit; }
    h3 { color: #6b46c2; font-family: inherit; }
    h6 { color: #f6ec94; }
    body { font-size: 2em; font-family: 'David Libre', serif; }
    ul, ol { padding: 0em; font-family: inherit; }
    .special-paragraph { color: #ffab40; }
  </style>
</head>
<body>
  <div style="position: relative;">
    <img 
      src="https://fdecrxcxrshebgrmbywz.supabase.co/storage/v1/object/public/storage/logos/a855d3b3-9402-4700-b06c-376d10665ddd-1736761369924.png" 
      style="
        position: absolute; 
        left: 0;
        top: 0;
        width: 100px;
        height: auto;
        object-fit: contain;
        margin: 1rem;
      "
    />
  </div>
  <div style="text-align:center">
    <h1>אבחון 252 - בדרך לזוגיות</h1>
    <h2>ניתוח מעמיק ותובנות אישיות</h2>
  </div>

  <p>ברוך הבא לאבחון האישי שלך בפרוייקט 252. מסמך זה מציג ניתוח מעמיק של תשובותיך, ומספק תובנות משמעותיות לגבי המסע הזוגי שלך.</p>
  <h3>המסמך כולל חמישה חלקים מרכזיים:</h3>
  <ul>
    <li>תמונת מצב נוכחית</li>
    <li>כלים פרקטיים</li>
    <li>שאלות מנחות</li>
    <li>סיכום והמלצות</li>
    <li>הצעת הצטרפות לפרוייקט 252</li>
  </ul>
</body>
</html>`;

// page1.html
const page1 = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=David+Libre:wght@400;500;700&family=Assistant:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    /* Same styles as opening-page.html */
  </style>
</head>
<body>
  <div style="position: relative;">
    <img 
      src="https://fdecrxcxrshebgrmbywz.supabase.co/storage/v1/object/public/storage/logos/a855d3b3-9402-4700-b06c-376d10665ddd-1736761369924.png" 
      style="
        position: absolute; 
        left: 0;
        top: 0;
        width: 100px;
        height: auto;
        object-fit: contain;
        margin: 1rem;
      "
    />
  </div>
  <h1>עמוד ראשון</h1>
  <p>תוכן כלשהו</p>
</body>
</html>`;

// page2.html
const page2 = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=David+Libre:wght@400;500;700&family=Assistant:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    /* Same styles as opening-page.html */
  </style>
</head>
<body>
  <div style="position: relative;">
    <img 
      src="https://fdecrxcxrshebgrmbywz.supabase.co/storage/v1/object/public/storage/logos/a855d3b3-9402-4700-b06c-376d10665ddd-1736761369924.png" 
      style="
        position: absolute; 
        left: 0;
        top: 0;
        width: 100px;
        height: auto;
        object-fit: contain;
        margin: 1rem;
      "
    />
  </div>
  <h1>עמוד שני</h1>
  <p>תוכן נוסף</p>
</body>
</html>`;

// Write files to disk
import fs from 'fs';
import path from 'path';

const htmlsDir = path.join(process.cwd(), 'htmls');

// Create htmls directory if it doesn't exist
if (!fs.existsSync(htmlsDir)) {
  fs.mkdirSync(htmlsDir);
}

fs.writeFileSync(path.join(htmlsDir, 'opening-page.html'), openingPage);
fs.writeFileSync(path.join(htmlsDir, 'page1.html'), page1);
fs.writeFileSync(path.join(htmlsDir, 'page2.html'), page2); 