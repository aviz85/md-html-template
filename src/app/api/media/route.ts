import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const templateId = formData.get('templateId') as string;

    if (!file || !templateId) {
      return NextResponse.json(
        { error: 'Missing file or templateId' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Only image files are allowed' },
        { status: 400 }
      );
    }

    // Get file extension
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    if (!fileExt || !['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt)) {
      return NextResponse.json(
        { error: 'Invalid file type' },
        { status: 400 }
      );
    }

    // Check file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size too large (max 5MB)' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `media/${templateId}/${fileName}`;

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from('storage')
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Error uploading to storage:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      );
    }

    // Save to media_files table
    const { error: dbError } = await supabaseAdmin
      .from('media_files')
      .insert([{
        template_id: templateId,
        file_path: filePath,
        created_at: new Date().toISOString()
      }]);

    if (dbError) {
      // If DB insert fails, try to clean up the uploaded file
      await supabaseAdmin.storage
        .from('storage')
        .remove([filePath]);
      throw dbError;
    }

    // Get the public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('storage')
      .getPublicUrl(filePath);

    return NextResponse.json({ filePath, publicUrl });
  } catch (error) {
    console.error('Error in media upload:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get('templateId');
    const filePath = searchParams.get('filePath');

    if (!templateId || !filePath) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Delete file from storage
    const { error: storageError } = await supabaseAdmin.storage
      .from('storage')
      .remove([filePath]);

    if (storageError) {
      console.error('Error deleting media file:', storageError);
      // Continue to delete DB record even if file delete fails
    }

    // Delete DB record
    const { error: dbError } = await supabaseAdmin
      .from('media_files')
      .delete()
      .eq('template_id', templateId)
      .eq('file_path', filePath);

    if (dbError) {
      throw dbError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error handling media deletion:', error);
    return NextResponse.json(
      { error: 'Failed to delete media' },
      { status: 500 }
    );
  }
} 