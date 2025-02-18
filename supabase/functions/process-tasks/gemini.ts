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
You are a professional proofreader. Your task is to proofread and improve transcribed text while maintaining its original meaning and content.

Guidelines:
1. Fix spelling and grammar errors
2. Organize into clear paragraphs
3. Add proper punctuation
4. Remove any XML tags (like <part1>, <part2>)
5. Remove duplicated content from overlapping segments
6. Maintain all original content and meaning
7. Keep technical terms and proper names unchanged
8. Return ONLY the proofread text without any explanations or comments
9. Focus on clarity and readability
10. If the text is in Hebrew, maintain right-to-left formatting and proper Hebrew punctuation

${input.context ? `Use this context for domain-specific terms and background: ${input.context}` : ''}
`

  const initialHistory: ChatMessage[] = [
    {
      role: 'user',
      parts: ['This is chunk ' + (input.chunk_index + 1) + ' of ' + input.total_chunks + '. Please proofread the following text:\n\n' + input.text]
    }
  ]

  const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': Deno.env.get('GEMINI_API_KEY') ?? ''
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
        temperature: 0.3,
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
    const error = await response.text()
    throw new Error(`Gemini API error: ${error}`)
  }

  const result = await response.json()
  
  // Extract the proofread text from the response
  const proofreadText = result.candidates[0].content.parts[0].text.trim()

  return {
    text: proofreadText
  }
} 