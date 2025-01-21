import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from './supabase-client'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

type MessageRole = "user" | "assistant"
type Message = {
  role: MessageRole
  content: string
}

async function getPrompts() {
  const SHEET_ID = process.env.GOOGLE_SHEET_ID!
  const API_KEY = process.env.GOOGLE_API_KEY!
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/A:A?key=${API_KEY}`
  
  const response = await fetch(url)
  const data = await response.json()
  return data.values.map((row: string[]) => row[0])
}

export async function processSubmission(submissionId: string) {
  try {
    // קבלת הנתונים מ-Supabase
    const { data: submission, error } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('id', submissionId)
      .single()

    if (error) throw error

    // המרת התשובות לפורמט הנכון
    const answers = Object.entries(submission.content)
      .map(([key, value]) => `שאלה: ${key} - תשובה: ${value}`)
      .join('\n')

    // קבלת הפרומפטים מגוגל שיטס
    const prompts = await getPrompts()
    
    // שיחה עם קלוד - הודעה ראשונה
    let messages: Message[] = [{ role: "user", content: answers + '\n' + prompts[0] }]
    let claudeResponses = []
    
    let msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 8192,
      messages: messages
    })
    claudeResponses.push(msg)

    // המשך השיחה עם שאר הפרומפטים
    for (let i = 1; i < prompts.length; i++) {
      const lastResponse = msg.content.find(block => 'text' in block)?.text || ''
      
      messages = [
        ...messages,
        { role: 'assistant' as const, content: lastResponse },
        { role: 'user' as const, content: prompts[i] }
      ]
      
      msg = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 8192,
        messages: messages
      })
      claudeResponses.push(msg)
    }

    // שמירת התוצאות ב-Supabase
    const { error: updateError } = await supabase
      .from('form_submissions')
      .update({
        status: 'completed',
        result: {
          claudeResponses,
          completeChat: [...messages, { role: 'assistant', content: msg.content[0].text }]
        }
      })
      .eq('id', submissionId)

    if (updateError) throw updateError

    return msg
  } catch (error) {
    console.error('Error in processSubmission:', error)
    // עדכון סטטוס שגיאה
    await supabase
      .from('form_submissions')
      .update({
        status: 'error',
        result: { error: error.message }
      })
      .eq('id', submissionId)
    throw error
  }
} 