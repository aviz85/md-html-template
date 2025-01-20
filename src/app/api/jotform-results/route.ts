import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.json();
    
    return NextResponse.json({ 
      success: true, 
      formData,
      mockResult: "זוהי תוצאה לדוגמה מ-Claude API" 
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to process form data' },
      { status: 400 }
    );
  }
} 