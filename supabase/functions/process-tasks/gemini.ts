interface ProofreadInput {
  text: string;
  chunk_index: number;
  total_chunks: number;
  context?: string;
}

interface ProofreadResult {
  text: string;
}

interface ChatMessage {
  role: 'user' | 'model';
  parts: string[];
}

export async function proofreadText(input: ProofreadInput): Promise<ProofreadResult> {
  const systemInstruction = `
You are a professional proofreader. Your task is to organize and clean up transcribed text while maintaining EXACT words and meaning.

STRICT Guidelines:
1. DO NOT change, replace, or remove any words - preserve them exactly as they appear
2. DO NOT add any new words or content
3. ONLY fix clear spelling mistakes (when 100% certain)
4. Organize text into logical paragraphs based on content
5. Add proper punctuation (periods, commas, question marks)
6. Remove XML tags (like <part1>, <part2>)
7. Remove duplicated content from overlapping segments
8. If the text is in Hebrew, maintain right-to-left formatting and proper Hebrew punctuation
9. Return ONLY the processed text without any explanations or comments

Your ONLY allowed changes are:
- Fixing obvious spelling errors
- Adding/fixing punctuation
- Organizing into paragraphs
- Removing XML tags and duplicates

${input.context ? `Context for technical terms and domain knowledge (but DO NOT change any words): ${input.context}` : ''}
`

  const initialHistory: ChatMessage[] = [
    {
      role: 'user',
      parts: ['This is chunk ' + (input.chunk_index + 1) + ' of ' + input.total_chunks + '. Clean up the following text while preserving ALL words exactly:\n\n' + input.text]
    }
  ]

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set')
  }

  const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: systemInstruction }]
        },
        ...initialHistory.map(msg => ({
          role: msg.role,
          parts: msg.parts.map(part => ({ text: part }))
        }))
      ],
      generationConfig: {
        temperature: 0.1, // Reduced temperature for more conservative changes
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
        stopSequences: []
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_NONE'
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_NONE'
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_NONE'
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_NONE'
        }
      ]
    })
  })

  if (!response.ok) {
    const error = await response.json()
    console.error('Gemini API error details:', error)
    throw new Error(`Gemini API error: ${error.error?.message || 'Unknown error'}`)
  }

  const result = await response.json()
  if (!result.candidates?.[0]?.content?.parts?.[0]?.text) {
    throw new Error('Invalid response format from Gemini API')
  }

  return {
    text: result.candidates[0].content.parts[0].text.trim()
  }
} 