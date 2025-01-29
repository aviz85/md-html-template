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
        relative_urls: false,
        remove_script_host: false,
        convert_urls: true,
        link_assume_external_targets: true,
        content_style: 'body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, sans-serif; font-size: 14px } p, h1, h2, h3, h4, h5, h6, div { direction: rtl !important; }',
        block_formats: 'פסקה=p; כותרת 1=h1; כותרת 2=h2; כותרת 3=h3',
        branding: false,
        promotion: false,
        elementpath: false,
        force_p_newlines: true,
        forced_root_block: 'p',
        valid_elements: 'p[style|dir],br,h1[style|dir],h2[style|dir],h3[style|dir],h4[style|dir],h5[style|dir],h6[style|dir],strong,em,u,s,ul,ol,li,a[href],span[style],div[style|dir],img[src|alt|width|height],table,tr,td,th',
        valid_styles: {
          '*': 'font-size,font-family,color,text-decoration,text-align,background-color,margin,padding,direction'
        },
        setup: (editor) => {
          editor.on('init', () => {
            editor.getContainer().style.direction = 'rtl';
          });
          
          editor.on('NodeChange', (e) => {
            const node = e.element as HTMLElement;
            if (node.nodeName === 'P' && !node.getAttribute('style')?.includes('direction')) {
              node.style.setProperty('direction', 'rtl');
            }
          });
          
          editor.on('BeforeSetContent', (e) => {
            if (!e.content.match(/style="[^"]*direction:/)) {
              e.content = e.content.replace(/<(p|h[1-6]|div)([^>]*)>/g, (match, tag, attrs) => {
                if (attrs.includes('style="')) {
                  return match.replace('style="', 'style="direction: rtl; ');
                }
                return `<${tag}${attrs} style="direction: rtl;">`;
              });
            }
          });

          // Add keyboard shortcut for direction toggle
          editor.addShortcut('meta+shift+r', 'Toggle text direction', () => {
            const node = editor.selection.getNode();
            const currentDir = node.style.direction || 'rtl';
            node.style.direction = currentDir === 'rtl' ? 'ltr' : 'rtl';
          });
        }
      }}
    />
  )
} 