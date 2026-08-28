'use client'

import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import LinkExtension from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import Typography from '@tiptap/extension-typography'
import { common, createLowlight } from 'lowlight'
import {
  EDITOR_IMAGE_REQUEST,
  SlashCommand,
} from '@/app/components/editor/slash-command'
import { slashSuggestionRender } from '@/app/components/editor/slash-menu'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { updatePageContent, updatePageStructure } from '@/domain/pages/actions'
import type { JsonValue } from '@/es/types'
import { useRefusal } from '@/app/i18n/use-refusal'

export type UploadedImageData = {
  id: string
  url: string
  fileName: string
  fileSize: number
  fileType: string
}

/**
 * Deep-copy the editor's JSON into plain objects before it crosses a Server
 * Action boundary.
 *
 * ProseMirror builds every node's `attrs` with `Object.create(null)`, and
 * React's Server Action serializer only passes through objects with the normal
 * Object prototype - so a null-prototype `attrs` is dropped in transit, without
 * an error. The document arrives at the server structurally intact but with
 * every attribute gone: images lose `src`, links lose `href`, headings lose
 * `level`.
 *
 * A JSON round trip rebuilds them as ordinary objects. It costs one clone per
 * save, which is nothing next to a document that silently loses its contents.
 */
function toPlainJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

// Custom Image extension supporting unique ID attributes
const CustomImage = Image.extend({
  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-id') || element.getAttribute('id'),
        renderHTML: (attributes) => {
          if (!attributes.id) {
            return {}
          }
          return {
            id: attributes.id,
            'data-id': attributes.id,
          }
        },
      },
    }
  },
})

/**
 * One lowlight registry for the module.
 *
 * `common` is ~35 languages rather than all 190, which keeps the bundle to
 * something reasonable while covering everything anyone actually pastes into a
 * document.
 */
const lowlight = createLowlight(common)

// Outside the component so re-renders do not construct duplicate extension
// instances - TipTap warns about those, and duplicated schema entries are how
// attributes quietly stop round-tripping.
const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    // Replaced below by the syntax-highlighting version. Leaving both in place
    // registers `codeBlock` twice.
    codeBlock: false,
  }),
  Placeholder.configure({
    placeholder: ({ node }) =>
      node.type.name === 'heading'
        ? 'Heading'
        : "Type '/' for commands…",
  }),
  Typography,
  Highlight.configure({ multicolor: true }),
  TaskList,
  TaskItem.configure({ nested: true }),
  TableKit.configure({ table: { resizable: true } }),
  CodeBlockLowlight.configure({ lowlight }),
  SlashCommand.configure({
    suggestion: { char: '/', startOfLine: false, render: slashSuggestionRender() },
  }),
  CustomImage.configure({ inline: true, allowBase64: true }),
  LinkExtension.configure({
    openOnClick: false,
    autolink: true,
    defaultProtocol: 'https',
    HTMLAttributes: {
      class: 'text-accent underline font-medium hover:opacity-80',
    },
  }),
]

export function TipTapEditor({
  slug,
  pageId,
  initialDoc,
  initialTitle,
  parentId,
  position,
  version,
  archived,
  onImageUploaded,
}: {
  slug: string
  pageId: string
  initialDoc: JsonValue
  initialTitle: string
  parentId: string | null
  position: number
  version: number
  archived: boolean
  onImageUploaded?: (data: UploadedImageData) => void
}) {
  const refusal = useRefusal()
  const [title, setTitle] = useState(initialTitle)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [, startTransition] = useTransition()

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [prevInitialTitle, setPrevInitialTitle] = useState(initialTitle)
  if (prevInitialTitle !== initialTitle) {
    setPrevInitialTitle(initialTitle)
    setTitle(initialTitle)
  }

  const saveContentImmediate = useCallback(
    (docJson: JsonValue) => {
      if (archived) return
      setSaveStatus('saving')
      setErrorMessage(null)

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)

      startTransition(async () => {
        const res = await updatePageContent(slug, pageId, docJson)
        if (res.ok) {
          setSaveStatus('saved')
        } else {
          setSaveStatus('error')
          setErrorMessage(refusal(res.error))
        }
      })
    },
    [slug, pageId, archived, refusal],
  )

  const handleSaveContent = useCallback(
    (docJson: JsonValue) => {
      if (archived) return
      setSaveStatus('saving')
      setErrorMessage(null)

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)

      saveTimeoutRef.current = setTimeout(() => {
        saveContentImmediate(docJson)
      }, 400)
    },
    [archived, saveContentImmediate],
  )

  const editorRef = useRef<ReturnType<typeof useEditor>>(null)

  const handleUploadFile = useCallback(
    async (file: File, targetPos?: number) => {
      if (archived) return

      setIsUploading(true)
      setErrorMessage(null)

      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('slug', slug)
        formData.append('pageId', pageId)

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        const data = await response.json()
        if (response.ok && data.slug) {
          // The slug is the file's whole identity. Building the src from it
          // here rather than trusting `data.url` keeps one definition of the
          // URL shape - and the slug is what ends up in the saved document, so
          // a document is portable across deployments in a way a baked-in
          // absolute URL would not be.
          const imageSrc = `/api/uploads/${data.slug}`
          const imageId = data.slug
          const imageAttrs = {
            src: imageSrc,
            alt: file.name,
            id: imageId,
          }

          // Trigger image uploaded callback if provided
          onImageUploaded?.({
            id: imageId,
            url: imageSrc,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
          })

          const currentEditor = editorRef.current
          if (currentEditor) {
            if (typeof targetPos === 'number') {
              currentEditor
                .chain()
                .focus()
                .insertContentAt(targetPos, {
                  type: 'image',
                  attrs: imageAttrs,
                })
                .run()
            } else {
              currentEditor.chain().focus().setImage(imageAttrs).run()
            }
            // Immediately save content when image is inserted
            saveContentImmediate(toPlainJson(currentEditor.getJSON()))
          }
        } else {
          setErrorMessage(
            data.error ||
              (response.status === 413
                ? 'That image is too large (max 10MB)'
                : response.status === 415
                  ? 'Only PNG, JPEG, GIF and WebP images are supported'
                  : 'Failed to upload image'),
          )
        }
      } catch {
        setErrorMessage('Network error while uploading image')
      } finally {
        setIsUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [slug, pageId, archived, saveContentImmediate, onImageUploaded],
  )

  /**
   * The slash menu's Image entry has to open *this* editor's file picker, so
   * the extension cannot live in the module-level list with the others.
   *
   * The handler is read through a ref rather than captured directly, which
   * keeps the memo dependency-free: rebuilding the extension array would
   * recreate the whole ProseMirror schema on a re-render, and duplicated schema
   * entries are how node attributes quietly stop round-tripping.
   */

  const editor = useEditor({
    extensions: EDITOR_EXTENSIONS,
    content: (initialDoc as Record<string, unknown>) || {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    },
    editable: !archived,
    immediatelyRender: false,
    editorProps: {
      handleDrop(view, event, _slice, moved) {
        if (!moved && event.dataTransfer?.files?.length) {
          const imageFiles = Array.from(event.dataTransfer.files).filter((file) =>
            file.type.startsWith('image/'),
          )
          if (imageFiles.length > 0) {
            event.preventDefault()
            const coordinates = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            })
            for (const file of imageFiles) {
              handleUploadFile(file, coordinates?.pos)
            }
            return true
          }
        }
        return false
      },
      handlePaste(_view, event) {
        if (event.clipboardData?.files?.length) {
          const imageFiles = Array.from(event.clipboardData.files).filter((file) =>
            file.type.startsWith('image/'),
          )
          if (imageFiles.length > 0) {
            event.preventDefault()
            for (const file of imageFiles) {
              handleUploadFile(file)
            }
            return true
          }
        }
        return false
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const json = toPlainJson(currentEditor.getJSON())
      handleSaveContent(json)
    },
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  // The slash menu's Image entry announces itself with a DOM event; opening the
  // picker is this component's job. Reading the ref here is fine - an effect is
  // not render.
  useEffect(() => {
    const openPicker = () => fileInputRef.current?.click()
    document.addEventListener(EDITOR_IMAGE_REQUEST, openPicker)
    return () => document.removeEventListener(EDITOR_IMAGE_REQUEST, openPicker)
  }, [])


  const lastPageIdRef = useRef(pageId)

  // Update editor content ONLY when switching to a different page
  useEffect(() => {
    if (editor && pageId !== lastPageIdRef.current) {
      lastPageIdRef.current = pageId
      editor.commands.setContent((initialDoc as Record<string, unknown>) || {
        type: 'doc',
        content: [],
      })
    }
  }, [pageId, initialDoc, editor])

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newTitle = e.target.value
    setTitle(newTitle)
    if (archived) return

    setSaveStatus('saving')
    startTransition(async () => {
      const res = await updatePageStructure(slug, pageId, parentId, newTitle, position)
      if (res.ok) {
        setSaveStatus('saved')
      } else {
        setSaveStatus('error')
        setErrorMessage(refusal(res.error))
      }
    })
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      handleUploadFile(file)
    }
  }

  function handleSetLink() {
    if (!editor) return
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('Enter link URL:', previousUrl)

    if (url === null) return

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  if (!editor) {
    return <div className="p-8 text-center text-ink-muted text-sm">Loading editor...</div>
  }

  return (
    <div className="flex flex-col h-full w-full bg-surface max-w-4xl mx-auto px-6 py-4">
      {/* Hidden File Input for Uploads */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Status & Version Header */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-line text-xs text-ink-muted">
        <div className="flex items-center gap-2">
          <span className="font-mono bg-surface-raised px-2 py-0.5 rounded text-[11px] border border-line">
            Aggregate v{version}
          </span>
          {saveStatus === 'saving' && (
            <span className="text-accent animate-pulse">Syncing change...</span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-emerald-500 font-medium">✓ Saved to log</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-red-500 font-medium">✕ Error saving</span>
          )}
          {isUploading && (
            <span className="text-accent font-medium animate-pulse">Uploading image...</span>
          )}
        </div>

        {archived && (
          <span className="text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded font-medium">
            Read Only
          </span>
        )}
      </div>

      {errorMessage && (
        <div role="alert" className="mb-4 rounded bg-red-500/10 p-3 text-xs text-red-500">
          {errorMessage}
        </div>
      )}

      {/* Page Title */}
      <input
        type="text"
        value={title}
        disabled={archived}
        onChange={handleTitleChange}
        placeholder="Untitled"
        className="w-full text-3xl font-bold bg-transparent outline-none mb-4 text-ink placeholder:text-ink-muted/40"
      />

      {/* Editor Toolbar */}
      {!archived && (
        <div className="flex flex-wrap items-center gap-1 p-1.5 mb-4 rounded-lg border border-line bg-surface-raised/60 text-xs">
          <ToolbarButton
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <s>S</s>
          </ToolbarButton>

          <div className="w-[1px] h-4 bg-line mx-1" />

          <ToolbarButton
            active={editor.isActive('heading', { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            H1
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            H3
          </ToolbarButton>

          <div className="w-[1px] h-4 bg-line mx-1" />

          <ToolbarButton
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            • Bullet
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1. Number
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            “ Quote
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('codeBlock')}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            {'</> Code'}
          </ToolbarButton>

          <div className="w-[1px] h-4 bg-line mx-1" />

          {/* Link Tools */}
          <ToolbarButton
            active={editor.isActive('link')}
            onClick={handleSetLink}
          >
            🔗 Link
          </ToolbarButton>

          {editor.isActive('link') && (
            <ToolbarButton
              onClick={() => editor.chain().focus().unsetLink().run()}
            >
              ❌ Unlink
            </ToolbarButton>
          )}

          {/* Image Upload Tool */}
          <ToolbarButton
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            🖼️ Image
          </ToolbarButton>

          <div className="w-[1px] h-4 bg-line mx-1" />

          <ToolbarButton
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            ↩ Undo
          </ToolbarButton>

          <ToolbarButton
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            ↪ Redo
          </ToolbarButton>
        </div>
      )}

      {/* Editor Content Area */}
      <div className="flex-1 overflow-y-auto py-2">
        <EditorContent
          editor={editor}
          className="prose max-w-none focus:outline-none min-h-[300px] text-ink leading-relaxed text-sm [&_.ProseMirror]:outline-none [&_p]:mb-3 [&_h1]:text-2xl [&_h1]:mb-3 [&_h2]:text-xl [&_h2]:mb-2 [&_h3]:text-lg [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_blockquote]:border-l-4 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_blockquote]:italic [&_code]:bg-surface-raised [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-surface-raised [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-line [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-4 [&_img]:border [&_img]:border-line"
        />
      </div>
    </div>
  )
}

function ToolbarButton({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`px-2 py-1 rounded transition font-medium text-xs ${
        active
          ? 'bg-accent text-white'
          : 'text-ink-muted hover:text-ink hover:bg-surface'
      } disabled:opacity-30`}
    >
      {children}
    </button>
  )
}
