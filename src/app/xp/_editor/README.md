# The XP editor

What makes a level, as opposed to what plays one (`../_runtime/`) or what a level
*is* (`packages/xp`, where every edit operation actually lives).

Thirty files in one directory before this. The folders are named for **what a
thing is** — the same rule `../_runtime/README.md` uses, and the same warning:
if two look right for a file, the file is probably doing two jobs.

| | |
|---|---|
| **`shell/`** | The window the creator lives in and the chrome around it — the dock and its layout, the icon rail, the toolbar, the title bar, and the client boundary that keeps all of it out of the server bundle. |
| **`panels/`** | What the dock holds. One file per question a level can be asked: what is in it, what it is made of, what its rules are, what it says, what game it is, who may talk. |
| **`stage/`** | The viewport and what happens in it — what was dragged in and where it landed, what each mouse button does given the tool in hand, and the angles a placement has. |
| **`code/`** | Language support for the script panel: colour without a code editor under it, and what can be written at the caret. |
| **`animator/`** | The keyframe editor, which was already its own room and stays one. |

## What stayed at the root

`editor.tsx` is the editor. `chrome.tsx` and `number-field.tsx` are trim every
panel uses, and `flow-edits.ts` is the one bundle of document operations the
shell hands down. A file is at the root because more than one folder needs it —
not because nobody decided.

## Where the rules are

Almost nothing here decides anything. The panels call `@kxb/xp/edit`, which is
where what a document may become is defined and tested; these files are the
controls that call it and the arguments they gather. When something in here
looks like it is making a decision, that is usually the sign it belongs in the
package instead — `flow-edits.ts` exists because thirteen callbacks were doing
exactly that in the shell.
