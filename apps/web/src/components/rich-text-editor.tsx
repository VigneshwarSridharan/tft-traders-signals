"use client";

import { useImperativeHandle, forwardRef, useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

export interface RichTextEditorHandle {
  insertText: (text: string) => void;
}

const TOOLBAR_BUTTON_CLASS =
  "rounded px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800";

export const RichTextEditor = forwardRef<
  RichTextEditorHandle,
  { value: string; onChange: (html: string) => void }
>(function RichTextEditor({ value, onChange }, ref) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          "min-h-[200px] rounded-b-md border border-t-0 border-zinc-300 bg-transparent px-3 py-2 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:text-zinc-50 [&_a]:text-blue-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(instance.getHTML());
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only resync on external value changes
  }, [value]);

  useImperativeHandle(ref, () => ({
    insertText: (text: string) => {
      editor?.chain().focus().insertContent(text).run();
    },
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 rounded-t-md border border-zinc-300 bg-zinc-50 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={`${TOOLBAR_BUTTON_CLASS} ${editor?.isActive("bold") ? "bg-zinc-200 dark:bg-zinc-800" : ""}`}
        >
          Bold
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={`${TOOLBAR_BUTTON_CLASS} ${editor?.isActive("italic") ? "bg-zinc-200 dark:bg-zinc-800" : ""}`}
        >
          Italic
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          className={`${TOOLBAR_BUTTON_CLASS} ${editor?.isActive("underline") ? "bg-zinc-200 dark:bg-zinc-800" : ""}`}
        >
          Underline
        </button>
        <button
          type="button"
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
          className={`${TOOLBAR_BUTTON_CLASS} ${editor?.isActive("heading", { level: 2 }) ? "bg-zinc-200 dark:bg-zinc-800" : ""}`}
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          className={`${TOOLBAR_BUTTON_CLASS} ${editor?.isActive("bulletList") ? "bg-zinc-200 dark:bg-zinc-800" : ""}`}
        >
          List
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          className={`${TOOLBAR_BUTTON_CLASS} ${editor?.isActive("orderedList") ? "bg-zinc-200 dark:bg-zinc-800" : ""}`}
        >
          Numbered
        </button>
        <button
          type="button"
          onClick={() => {
            const url = window.prompt("Link URL");
            if (url) {
              editor?.chain().focus().setLink({ href: url }).run();
            }
          }}
          className={TOOLBAR_BUTTON_CLASS}
        >
          Link
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().undo().run()}
          className={TOOLBAR_BUTTON_CLASS}
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().redo().run()}
          className={TOOLBAR_BUTTON_CLASS}
        >
          Redo
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
});
