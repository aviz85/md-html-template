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

    // Check if logo already exists
    const { data: existingLogo } = await supabase
      .from('logos')
      .select('file_path')
      .eq('template_id', templateId)
      .single()

    // If logo exists, delete the old file
    if (existingLogo) {
      const { error: deleteError } = await supabase.storage
        .from('storage')
        .remove([existingLogo.file_path])

      if (deleteError) {
        console.error('Error deleting old logo:', deleteError)
        // Continue even if delete fails
      }

      // Delete the old record
      await supabase
        .from('logos')
        .delete()
        .eq('template_id', templateId)
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png'
    const fileName = `${templateId}-${Date.now()}.${fileExt}`
    const filePath = `logos/${fileName}`

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from('storage')
      .upload(filePath, buffer, {
        contentType: file.type || 'image/png',
        upsert: true
      })

    if (uploadError) {
      throw uploadError
    }

    const { error: dbError } = await supabase
      .from('logos')
      .insert([{ 
        template_id: templateId, 
        file_path: filePath,
        created_at: new Date().toISOString()
      }])

    if (dbError) {
      // If DB insert fails, try to clean up the uploaded file
      await supabase.storage
        .from('storage')
        .remove([filePath])
      throw dbError
    }

    // Get the public URL
    const { data: { publicUrl } } = supabase.storage
      .from('storage')
      .getPublicUrl(filePath)

    return NextResponse.json({ filePath, publicUrl })
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

    // Delete file first
    const { error: storageError } = await supabase.storage
      .from('storage')
      .remove([filePath])

    if (storageError) {
      console.error('Error deleting logo file:', storageError)
      // Continue to delete DB record even if file delete fails
    }

    // Then delete DB record
    const { error: dbError } = await supabase
      .from('logos')
      .delete()
      .eq('template_id', templateId)

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