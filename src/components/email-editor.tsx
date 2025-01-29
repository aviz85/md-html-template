import { Editor } from '@tinymce/tinymce-react'

interface EmailEditorProps {
  value: string
  onChange: (value: string) => void
}

export function EmailEditor({ value, onChange }: EmailEditorProps) {
  return (
    <Editor
      apiKey="qseaxv2nzbwzjpmrnq28oi7mpf0igqfah7yq2uu8uti6jl7g"
      value={value}
      onEditorChange={onChange}
      init={{
        height: 400,
        menubar: true,
        directionality: 'rtl',
        language: 'he_IL',
        plugins: [
          'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
          'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
          'insertdatetime', 'media', 'table', 'help', 'wordcount', 'directionality'
        ],
        toolbar: 'undo redo | blocks | ' +
          'bold italic forecolor | alignleft aligncenter ' +
          'alignright alignjustify | bullist numlist outdent indent | ' +
          'removeformat | code | help | ltr rtl',
        content_style: 'body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, sans-serif; font-size: 14px }',
        block_formats: 'פסקה=p; כותרת 1=h1; כותרת 2=h2; כותרת 3=h3',
        branding: false,
        promotion: false,
        elementpath: false,
        force_p_newlines: true,
        forced_root_block: 'p',
        valid_elements: 'p,br,h1,h2,h3,h4,h5,h6,strong,em,u,s,ul,ol,li,a[href],span[style],div,img[src|alt|width|height],table,tr,td,th',
        valid_styles: {
          '*': 'font-size,font-family,color,text-decoration,text-align,background-color,margin,padding,direction'
        },
        setup: (editor) => {
          editor.on('init', () => {
            editor.getContainer().style.direction = 'rtl';
          });
        }
      }}
    />
  )
} 