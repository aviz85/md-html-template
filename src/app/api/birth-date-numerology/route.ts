import { NextResponse } from 'next/server';
import { calculateBirthDateNumerology } from '@/lib/birth-date-numerology';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // וולידציה בסיסית
    if (!data.form_data) {
      return NextResponse.json({ error: 'Missing form_data' }, { status: 400 });
    }

    // חישוב נומרולוגי לתאריך לידה
    const result = await calculateBirthDateNumerology(data);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in birth date numerology calculation:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// בדיקת זמינות השירות
export async function GET() {
  return NextResponse.json({ status: 'Birth date numerology service is running' });
} 