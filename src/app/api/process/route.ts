import { processSubmission } from '@/lib/claude'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const submissionId = searchParams.get('submissionId')
  
  if (!submissionId) {
    return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 })
  }

  try {
    const result = await processSubmission(submissionId)
    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('Error processing submission:', error)
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { submissionId } = await request.json()
    if (!submissionId) {
      return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 })
    }

    const result = await processSubmission(submissionId)
    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('Error processing submission:', error)
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
} 