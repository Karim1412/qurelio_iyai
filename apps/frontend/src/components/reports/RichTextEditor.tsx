'use client';

import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import { List, ListOrdered, Highlighter, ExternalLink } from 'lucide-react';
import { cn } from '@/utils/cn';

const HIGHLIGHT_COLORS = [
  { label: 'Yellow', color: '#fef08a' },
  { label: 'Green', color: '#bbf7d0' },
  { label: 'Blue', color: '#bfdbfe' },
  { label: 'Pink', color: '#fbcfe8' },
  { label: 'Orange', color: '#fed7aa' },
] as const;

const EDITOR_PROSE =
  'prose prose-sm max-w-none text-sm [&_.ProseMirror]:min-h-[120px] [&_.ProseMirror]:outline-none ' +
  '[&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 ' +
  '[&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 ' +
  '[&_.ProseMirror_li]:my-0.5 [&_mark]:rounded-sm [&_mark]:px-0.5';

interface RichTextEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  editable?: boolean;
  disabled?: boolean;
}

export function RichTextEditor({
  value = '',
  onChange,
  placeholder = 'Enter text...',
  editable = true,
  disabled = false,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Underline,
      Link.configure({ openOnClick: false }),
      Highlight.configure({ multicolor: true }),
    ],
    content: value,
    editable: editable && !disabled,
    onUpdate: ({ editor: ed }) => {
      onChange?.(ed.getHTML());
    },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'focus:outline-none',
        'data-placeholder': placeholder,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const next = value || '';
    if (current !== next) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) {
    return null;
  }

  const toggleLink = () => {
    const url = window.prompt('Enter URL:');
    if (url) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  const applyHighlight = (color: string) => {
    if (editor.isActive('highlight', { color })) {
      editor.chain().focus().unsetHighlight().run();
    } else {
      editor.chain().focus().setHighlight({ color }).run();
    }
  };

  if (!editable || disabled) {
    return (
      <div className={cn('rounded-lg border border-gray-200 bg-gray-50 p-4 text-gray-900', EDITOR_PROSE)}>
        <EditorContent editor={editor} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-2">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Bold"
        >
          <span className="text-sm font-bold">B</span>
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Italic"
        >
          <span className="text-sm italic">I</span>
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          title="Underline"
        >
          <u className="text-sm">U</u>
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <span className="text-xs font-semibold">H1</span>
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <span className="text-xs font-semibold">H2</span>
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Bullet list"
        >
          <List className="h-4 w-4" aria-hidden />
          <span className="sr-only">Bullet list</span>
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Numbered list"
        >
          <ListOrdered className="h-4 w-4" aria-hidden />
          <span className="sr-only">Numbered list</span>
        </ToolbarButton>

        <ToolbarDivider />

        <div className="flex items-center gap-0.5 rounded-md border border-gray-200 bg-white px-1 py-0.5" title="Highlight color">
          <Highlighter className="mx-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
          {HIGHLIGHT_COLORS.map(({ label, color }) => (
            <button
              key={color}
              type="button"
              title={`Highlight: ${label}`}
              onClick={() => applyHighlight(color)}
              className={cn(
                'h-5 w-5 rounded border border-gray-300 transition-transform hover:scale-110',
                editor.isActive('highlight', { color }) && 'ring-2 ring-blue-500 ring-offset-1',
              )}
              style={{ backgroundColor: color }}
              aria-label={`Highlight ${label}`}
            />
          ))}
          <button
            type="button"
            title="Remove highlight"
            onClick={() => editor.chain().focus().unsetHighlight().run()}
            className="ml-0.5 rounded px-1 text-[10px] text-gray-500 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          title="Quote"
        >
          <span className="text-sm">&ldquo;</span>
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive('codeBlock')}
          title="Code block"
        >
          <span className="font-mono text-xs">&lt;/&gt;</span>
        </ToolbarButton>

        <ToolbarButton onClick={toggleLink} active={editor.isActive('link')} title="Link">
          <ExternalLink className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
        >
          <span className="text-sm">↶</span>
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
        >
          <span className="text-sm">↷</span>
        </ToolbarButton>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
        <EditorContent editor={editor} className={cn('px-4 py-3', EDITOR_PROSE)} />
      </div>
    </div>
  );
}

function ToolbarDivider() {
  return <div className="mx-0.5 h-6 w-px shrink-0 bg-gray-300" aria-hidden />;
}

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({
  onClick,
  active = false,
  disabled = false,
  title,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex items-center justify-center rounded p-1.5 transition-colors',
        active ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-200',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {children}
    </button>
  );
}
