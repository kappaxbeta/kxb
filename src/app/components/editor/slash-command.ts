'use client'

import { Extension } from '@tiptap/core'
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import type { Editor, Range } from '@tiptap/core'

/**
 * The `/` menu.
 *
 * Built on ProseMirror's Suggestion utility, which is the same machinery
 * `@mention` uses: watch for a trigger character at a word boundary, track what
 * is typed after it, and hand the surrounding range to a renderer so the text
 * can be replaced with something else.
 *
 * The important detail is that the command *deletes the typed text first*.
 * Without `deleteRange`, running "Heading 1" would leave a literal "/h1" in the
 * document next to the new heading - which is the bug every hand-rolled slash
 * menu ships with once.
 */

export interface SlashItem {
  title: string
  description: string
  /** Typed abbreviations that should also match, e.g. "h1" for Heading 1. */
  keywords: string[]
  group: string
  run: (editor: Editor, range: Range) => void
}

/**
 * Fired when the menu's Image entry is chosen.
 *
 * The upload flow - file picker, progress, error reporting - belongs to the
 * editor component, and this module runs inside a ProseMirror plugin with no
 * access to it. A DOM event is the honest boundary between the two: the plugin
 * announces intent, React decides what to do about it.
 *
 * The alternatives were worse. Passing a callback in meant building the
 * extension per component instance, which drags a React ref into render and
 * rebuilds the ProseMirror schema on re-render. Emitting on the editor needed
 * an untyped cast that would break silently on a TipTap upgrade.
 */
export const EDITOR_IMAGE_REQUEST = 'kxb:editor-image-request'

export const SLASH_ITEMS: SlashItem[] = [
  {
    title: 'Text',
    description: 'Plain paragraph',
    keywords: ['p', 'paragraph', 'body'],
    group: 'Basic',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: 'Heading 1',
    description: 'Big section heading',
    keywords: ['h1', 'title', 'large'],
    group: 'Basic',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    keywords: ['h2', 'subtitle'],
    group: 'Basic',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    keywords: ['h3'],
    group: 'Basic',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
  },
  {
    title: 'Bullet list',
    description: 'A simple bulleted list',
    keywords: ['ul', 'unordered', 'point'],
    group: 'Lists',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'Numbered list',
    description: 'A list with numbering',
    keywords: ['ol', 'ordered', 'number'],
    group: 'Lists',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'To-do list',
    description: 'Track tasks with checkboxes',
    keywords: ['todo', 'task', 'checkbox', 'check'],
    group: 'Lists',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: 'Quote',
    description: 'Capture a quotation',
    keywords: ['blockquote', 'cite'],
    group: 'Blocks',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: 'Code block',
    description: 'Syntax-highlighted code',
    keywords: ['code', 'snippet', 'pre'],
    group: 'Blocks',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: 'Divider',
    description: 'A horizontal rule',
    keywords: ['hr', 'rule', 'separator', 'line'],
    group: 'Blocks',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: 'Table',
    description: '3x3 table with a header row',
    keywords: ['grid', 'rows', 'columns'],
    group: 'Blocks',
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    title: 'Image',
    description: 'Upload a picture',
    keywords: ['picture', 'photo', 'img', 'upload'],
    group: 'Media',
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run()
      document.dispatchEvent(new CustomEvent(EDITOR_IMAGE_REQUEST))
    },
  },
]

/** Case-insensitive match on the title or any keyword. */
export function filterSlashItems(items: SlashItem[], query: string): SlashItem[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return items

  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(needle) ||
      item.keywords.some((keyword) => keyword.startsWith(needle)),
  )
}

export const slashCommandPluginKey = new PluginKey('slashCommand')

export interface SlashCommandOptions {
  suggestion: Omit<SuggestionOptions, 'editor'>
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        // Only at the start of a line, which is how Notion behaves. Without
        // this, typing a URL or a date mid-sentence pops the menu open.
        startOfLine: true,
        pluginKey: slashCommandPluginKey,
        command: ({ editor, range, props }) => {
          ;(props as SlashItem).run(editor, range)
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...this.options.suggestion })]
  },
})
