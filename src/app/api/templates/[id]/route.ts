import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const templateId = params.id;
    console.log(`Attempting to delete template with ID: ${templateId}`);
    
    // First check if the template exists
    const { data: template, error: templateCheckError } = await supabaseAdmin
      .from('templates')
      .select('id')
      .eq('id', templateId)
      .single();
    
    if (templateCheckError) {
      console.error('Error checking template existence:', templateCheckError);
      return NextResponse.json(
        { error: 'Template not found or error checking template' },
        { status: 404 }
      );
    }
    
    // Check for and delete any related media files
    try {
      // First, get the media files associated with this template
      const { data: mediaFiles, error: mediaFetchError } = await supabaseAdmin
        .from('media_files')
        .select('file_path')
        .eq('template_id', templateId);
      
      if (mediaFetchError) {
        console.error('Error fetching related media files:', mediaFetchError);
        // Continue with deletion even if we can't fetch media files
      } else if (mediaFiles && mediaFiles.length > 0) {
        console.log(`Found ${mediaFiles.length} media files to delete`);
        
        // Delete the files from storage
        const filePaths = mediaFiles.map(file => file.file_path);
        const { error: storageDeleteError } = await supabaseAdmin.storage
          .from('storage')
          .remove(filePaths);
        
        if (storageDeleteError) {
          console.error('Error deleting media files from storage:', storageDeleteError);
          // Continue with deletion even if storage deletion fails
        }
        
        // Delete the media_files records
        const { error: mediaDeleteError } = await supabaseAdmin
          .from('media_files')
          .delete()
          .eq('template_id', templateId);
        
        if (mediaDeleteError) {
          console.error('Error deleting media_files records:', mediaDeleteError);
          // Continue with deletion even if media_files deletion fails
        }
      }
    } catch (mediaError) {
      console.error('Error handling media files:', mediaError);
      // Continue with deletion even if media handling fails
    }
    
    // Delete custom_fonts related to this template
    try {
      const { error: fontsDeleteError } = await supabaseAdmin
        .from('custom_fonts')
        .delete()
        .eq('template_id', templateId);
      
      if (fontsDeleteError) {
        console.error('Error deleting custom fonts:', fontsDeleteError);
        // Continue with deletion even if font deletion fails
      }
    } catch (fontError) {
      console.error('Error handling fonts:', fontError);
      // Continue with template deletion even if font handling fails
    }
    
    // Delete template_contents related to this template
    try {
      const { error: contentsDeleteError } = await supabaseAdmin
        .from('template_contents')
        .delete()
        .eq('template_id', templateId);
      
      if (contentsDeleteError) {
        console.error('Error deleting template contents:', contentsDeleteError);
        // Continue with deletion even if content deletion fails
      }
    } catch (contentError) {
      console.error('Error handling template contents:', contentError);
      // Continue with template deletion even if content handling fails
    }
    
    // Finally delete the template itself
    const { error } = await supabaseAdmin
      .from('templates')
      .delete()
      .eq('id', templateId);

    if (error) {
      console.error('Error deleting template:', error);
      throw error;
    }

    console.log(`Successfully deleted template with ID: ${templateId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json(
      { error: 'Failed to delete template' },
      { status: 500 }
    );
  }
} 