import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.json();
    
    if (!formData) {
      return NextResponse.json({ 
        success: false, 
        error: 'No form data received' 
      }, { status: 400 });
    }

    console.log('Received form data:', formData);
    
    return NextResponse.json({ 
      success: true, 
      formData,
      mockResult: "זוהי תוצאה לדוגמה מ-Claude API" 
    });
  } catch (error) {
    console.error('Error processing form data:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to parse request body',
      details: error instanceof Error ? error.stack : undefined
    }, { 
      status: 400 
    });
  }
} 