import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import { Button } from './ui/button'

interface EmailEditorProps {
  value: string
  onChange: (value: string) => void
}

export function EmailEditor({ value, onChange }: EmailEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Link.configure({
        openOnClick: false,
      }),
      Underline,
      TextStyle,
      Color,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[200px] p-4 focus:outline-none',
        dir: 'rtl',
      },
    },
  })

  if (!editor) {
    return null
  }

  return (
    <div className="border rounded-md" dir="rtl">
      <div className="border-b bg-muted p-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={editor.isActive('bold') ? 'default' : 'outline'}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          מודגש
        </Button>
        <Button
          size="sm"
          variant={editor.isActive('italic') ? 'default' : 'outline'}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          נטוי
        </Button>
        <Button
          size="sm"
          variant={editor.isActive('underline') ? 'default' : 'outline'}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          קו תחתון
        </Button>
        <Button
          size="sm"
          variant={editor.isActive({ textAlign: 'right' }) ? 'default' : 'outline'}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
        >
          ימין
        </Button>
        <Button
          size="sm"
          variant={editor.isActive({ textAlign: 'center' }) ? 'default' : 'outline'}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
        >
          מרכז
        </Button>
        <Button
          size="sm"
          variant={editor.isActive({ textAlign: 'left' }) ? 'default' : 'outline'}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
        >
          שמאל
        </Button>
        <Button
          size="sm"
          variant={editor.isActive('heading', { level: 1 }) ? 'default' : 'outline'}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          כותרת 1
        </Button>
        <Button
          size="sm"
          variant={editor.isActive('heading', { level: 2 }) ? 'default' : 'outline'}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          כותרת 2
        </Button>
        <Button
          size="sm"
          variant={editor.isActive('bulletList') ? 'default' : 'outline'}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          רשימה
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
} 