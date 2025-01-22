import { processSubmission } from '@/lib/claude'
import { NextResponse } from 'next/server'

export const runtime = 'edge'  // Changed from nodejs to edge for better performance
export const maxDuration = 300 // 5 minutes timeout

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
  console.log('🚀 Process API called - POST')
  try {
    const { submissionId } = await request.json()
    console.log('📝 Processing submission:', submissionId)
    
    if (!submissionId) {
      console.error('❌ Missing submissionId in request')
      return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 })
    }

    console.log('🤖 Starting Claude processing for submission:', submissionId)
    const result = await processSubmission(submissionId)
    console.log('✅ Successfully processed submission:', submissionId)
    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('❌ Error processing submission:', error)
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
} 