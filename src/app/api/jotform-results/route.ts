import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // Handle both JSON and form-urlencoded data
    const contentType = request.headers.get('content-type') || '';
    let formData: any = {};
    
    if (contentType.includes('application/json')) {
      formData = await request.json();
    } else {
      const rawFormData = await request.formData();
      // Convert FormData to object
      for (const [key, value] of rawFormData.entries()) {
        formData[key] = value;
      }
    }
    
    if (!formData || Object.keys(formData).length === 0) {
      return new Response(`
        <html dir="rtl">
          <head>
            <title>שגיאה</title>
            <meta charset="utf-8">
          </head>
          <body>
            <h1>שגיאה: לא התקבל מידע מהטופס</h1>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        status: 400
      });
    }

    console.log('Received form data:', formData);
    
    return new Response(`
      <!DOCTYPE html>
      <html dir="rtl">
        <head>
          <title>תוצאות הטופס</title>
          <meta charset="utf-8">
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-50">
          <div class="container mx-auto p-8">
            <div class="bg-white rounded-lg shadow-lg p-6 mb-8">
              <h1 class="text-2xl font-bold mb-4">תוצאות</h1>
              <div class="text-lg">זוהי תוצאה לדוגמה מ-Claude API</div>
            </div>
            
            <div class="bg-gray-100 rounded-lg p-6">
              <h2 class="text-xl font-semibold mb-4">מידע מהטופס</h2>
              <pre class="bg-gray-800 text-white p-4 rounded overflow-auto" dir="ltr">
                ${JSON.stringify(formData, null, 2)}
              </pre>
            </div>
          </div>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  } catch (error) {
    console.error('Error processing form data:', error);
    return new Response(`
      <html dir="rtl">
        <head>
          <title>שגיאה</title>
          <meta charset="utf-8">
        </head>
        <body>
          <h1>שגיאה בעיבוד הטופס</h1>
          <pre dir="ltr">${error instanceof Error ? error.message : 'Unknown error'}</pre>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 400
    });
  }
} 