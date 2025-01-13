import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Create a Supabase client with the service role key
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const templateId = formData.get('templateId') as string

    if (!file || !templateId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const fileExt = file.name.split('.').pop()
    const fileName = `${templateId}-${Date.now()}.${fileExt}`
    const filePath = `logos/${fileName}`

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from('storage')
      .upload(filePath, buffer, {
        contentType: file.type
      })

    if (uploadError) {
      throw uploadError
    }

    const { error: dbError } = await supabase
      .from('logos')
      .insert([{ template_id: templateId, file_path: filePath }])

    if (dbError) {
      throw dbError
    }

    return NextResponse.json({ filePath })
  } catch (error) {
    console.error('Error handling logo upload:', error)
    return NextResponse.json(
      { error: 'Failed to upload logo' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const templateId = searchParams.get('templateId')
    const filePath = searchParams.get('filePath')

    if (!templateId || !filePath) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const { error: storageError } = await supabase.storage
      .from('storage')
      .remove([filePath])

    if (storageError) {
      throw storageError
    }

    const { error: dbError } = await supabase
      .from('logos')
      .delete()
      .match({ template_id: templateId })

    if (dbError) {
      throw dbError
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error handling logo deletion:', error)
    return NextResponse.json(
      { error: 'Failed to delete logo' },
      { status: 500 }
    )
  }
} 