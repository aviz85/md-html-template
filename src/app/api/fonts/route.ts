import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { templateId, fontName, fileExt, fileData } = await request.json()

    // Upload font file to storage
    const filePath = `${fontName}.${fileExt}`
    const { data: uploadData, error: fileError } = await supabase.storage
      .from('fonts')
      .upload(filePath, Buffer.from(fileData), {
        contentType: `font/${fileExt}`
      })

    if (fileError) throw fileError

    // Get the public URL of the uploaded font
    const { data: { publicUrl } } = supabase.storage
      .from('fonts')
      .getPublicUrl(uploadData.path)

    // Save font metadata to custom_fonts table
    const { data: font, error: fontError } = await supabase
      .from('custom_fonts')
      .insert({
        template_id: templateId,
        name: fontName,
        file_path: filePath,
        font_family: fontName,
        format: fileExt
      })
      .select()
      .single()

    if (fontError) throw fontError

    // Load the updated fonts
    const { data: fonts } = await supabase
      .from('custom_fonts')
      .select('*')
      .eq('template_id', templateId)

    return NextResponse.json({ fonts })
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

    if (error) throw error

    return NextResponse.json({ fonts })
  } catch (error) {
    console.error('Error loading fonts:', error)
    return NextResponse.json({ error }, { status: 500 })
  }
} 