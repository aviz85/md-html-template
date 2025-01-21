import { processSubmission } from '@/lib/claude'

export async function POST(request: Request) {
  try {
    const { submissionId } = await request.json()
    const result = await processSubmission(submissionId)
    
    return new Response(JSON.stringify({ success: true, result }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error processing submission:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
} 