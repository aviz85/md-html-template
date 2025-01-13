import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { templateId, fontName, fileExt, fileData } = await request.json()

    // Validate input
    if (!templateId || !fontName || !fileExt || !fileData) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Check if font already exists
    const { data: existingFont } = await supabase
      .from('custom_fonts')
      .select('file_path')
      .eq('template_id', templateId)
      .eq('name', fontName)
      .single()

    // If font exists, delete the old file
    if (existingFont) {
      const { error: deleteError } = await supabase.storage
        .from('storage')
        .remove([existingFont.file_path])

      if (deleteError) {
        console.error('Error deleting old font:', deleteError)
        // Continue even if delete fails
      }

      // Delete the old record
      await supabase
        .from('custom_fonts')
        .delete()
        .eq('template_id', templateId)
        .eq('name', fontName)
    }

    // Upload font file to storage
    const filePath = `fonts/${fontName}.${fileExt}`
    const { data: uploadData, error: fileError } = await supabase.storage
      .from('storage')
      .upload(filePath, Buffer.from(fileData), {
        contentType: `font/${fileExt}`,
        upsert: true
      })

    if (fileError) {
      throw fileError
    }

    // Get the public URL of the uploaded font
    const { data: { publicUrl } } = supabase.storage
      .from('storage')
      .getPublicUrl(uploadData.path)

    // Save font metadata to custom_fonts table
    const fontData = {
      template_id: templateId,
      name: fontName,
      file_path: filePath,
      font_family: fontName,
      format: fileExt,
      created_at: new Date().toISOString()
    }

    const { error: fontError } = await supabase
      .from('custom_fonts')
      .insert([fontData])

    if (fontError) {
      // If DB insert fails, try to clean up the uploaded file
      await supabase.storage
        .from('storage')
        .remove([filePath])
      throw fontError
    }

    // Load the updated fonts
    const { data: fonts, error: loadError } = await supabase
      .from('custom_fonts')
      .select('*')
      .eq('template_id', templateId)
      .order('created_at', { ascending: false })

    if (loadError) throw loadError

    return NextResponse.json({ fonts, publicUrl })
  } catch (error) {
    console.error('Error uploading font:', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const templateId = searchParams.get('templateId')

    if (!templateId) {
      return NextResponse.json({ error: 'templateId is required' }, { status: 400 })
    }

    const { data: fonts, error } = await supabase
      .from('custom_fonts')
      .select('*')
      .eq('template_id', templateId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ fonts })
  } catch (error) {
    console.error('Error loading fonts:', error)
    return NextResponse.json({ error }, { status: 500 })
  }
} 