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
          'removeformat | code | help | ltr rtl | link',
        convert_urls: false,
        remove_script_host: false,
        link_assume_external_targets: true,
        content_style: `
          body { 
            font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, sans-serif; 
            font-size: 14px;
            direction: rtl !important;
          }
          p, h1, h2, h3, h4, h5, h6, div, span, table, td, th, li, ul, ol { 
            direction: rtl !important;
            text-align: right !important;
          }
        `,
        block_formats: 'פסקה=p; כותרת 1=h1; כותרת 2=h2; כותרת 3=h3',
        branding: false,
        promotion: false,
        elementpath: false,
        force_p_newlines: true,
        forced_root_block: 'p',
        valid_elements: 'p[style|dir|align],br,h1[style|dir|align],h2[style|dir|align],h3[style|dir|align],h4[style|dir|align],h5[style|dir|align],h6[style|dir|align],strong,em,u,s,ul,ol,li[style|dir|align],a[href],span[style|dir|align],div[style|dir|align],img[src|alt|width|height],table[style|dir|align],tr,td[style|dir|align],th[style|dir|align]',
        valid_styles: {
          '*': 'font-size,font-family,color,text-decoration,text-align,background-color,margin,padding,direction'
        },
        setup: (editor) => {
          editor.on('init', () => {
            editor.getContainer().style.direction = 'rtl';
            // Force RTL on the editor's body
            editor.getBody().style.direction = 'rtl';
            editor.getBody().dir = 'rtl';
          });
          
          editor.on('NodeChange', (e) => {
            const node = e.element as HTMLElement;
            // Force RTL on any element that doesn't have it
            if (!node.style.direction) {
              node.style.setProperty('direction', 'rtl', 'important');
              node.setAttribute('dir', 'rtl');
            }
            if (!node.style.textAlign) {
              node.style.setProperty('text-align', 'right', 'important');
            }
          });
          
          editor.on('BeforeSetContent', (e) => {
            // Add RTL to any new content
            e.content = e.content.replace(/<([a-zA-Z0-9]+)([^>]*)>/g, (match, tag, attrs) => {
              // Don't modify closing tags or self-closing tags
              if (match.endsWith('/>') || match.startsWith('</')) return match;
              
              // Add style and dir attributes
              const style = attrs.includes('style="') 
                ? attrs.replace('style="', 'style="direction: rtl !important; text-align: right !important; ')
                : attrs + ' style="direction: rtl !important; text-align: right !important;"';
              
              return `<${tag}${style} dir="rtl">`;
            });
          });

          // Add keyboard shortcut for direction toggle
          editor.addShortcut('meta+shift+r', 'Toggle text direction', () => {
            const node = editor.selection.getNode();
            const currentDir = node.style.direction || 'rtl';
            node.style.direction = currentDir === 'rtl' ? 'ltr' : 'rtl';
            node.style.textAlign = currentDir === 'rtl' ? 'left' : 'right';
          });
        }
      }}
    />
  )
} 