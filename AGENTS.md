# Kanban Board — Agent Guide

Single-file app (`index.html`, ~3123 lines), zero dependencies, no build step. SQLite via sql.js WebAssembly runs in-browser; Node HTTP server serves `.wasm` with correct MIME type and provides disk persistence API endpoints. (Line count drifts as features evolve.)

## Run commands

```bash
./start.sh [port]       # default 8089, starts `node server.js` via nohup
node server.js          # foreground — always binds to 8089 (ignores CLI args)
pkill -f "node server"  # stop
```

**Node.js required.** Python fallback in `start.sh` serves static files but has **no API support**, so save/open features will not work. Server log → `/tmp/kanban-server.log`.

## Port quirk

`server.js:226` hardcodes `PORT = 8089` — it reads no CLI arguments. The port arg to `start.sh` only affects the startup message, not the actual server. To change ports you must edit `server.js`.

## Server API (for disk persistence)

The browser never writes directly to disk over plain HTTP (`file://`). On HTTP a Node server provides four endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/setup-save` | POST `{ path }` | Record where next `save-db` should write (validates `.sqlite`/`.db`) |
| `/api/save-db` | POST `{ data: "<base64>" }` + optional `X-Target-Path` header | Atomically writes DB to the recorded path via a temp file + rename; header overrides setup-save target |
| `/api/open-file` | POST `{ path }` | Streams a local `.sqlite` as binary response (`Content-Type: application/octet-stream`) |
| `/api/list?path=<encoded>` | GET | Directory listing filtered to interesting files (`.sqlite`, `.db`, dirs) |

The server also maintains **preferences** in `kanban_prefs.json` (read/written via `/api/preferences`). This is separate from per-database labels.

## Development workflow

Manual edit-and-refresh only — no build step, no package manager, no lint/typecheck/format scripts. Don't look for test or type scripts; they don't exist.

## Architecture

- **Single file**: `index.html` (~3123 lines) — CSS `<style>`, inline JS, no build step.
- **Database**: sql.js (SQLite WebAssembly) runs in-memory via `initSqlJs({ locateFile: file => 'assets/' + file })`. WASM binary at `assets/sql-wasm.wasm` (~650KB), JS loader at `assets/sql-wasm.js` (~50KB).
- **WYSIWYG**: SunEditor v2.47.11 for rich-text editing. JS at `assets/suneditor.min.js` (2.5MB), base CSS at `assets/suneditor.min.css` (55KB), dark theme overrides at `assets/suneditor.min.dark.css` (3.4KB). Exposes `window.SUNEDITOR`.
- **Persistence**: DB exported to base64 and saved either via browser File System Access API (HTTPS) or the Node server's `/api/save-db` (HTTP). Labels are stored inside each `.sqlite` file itself (`labels_prefs(key, value TEXT)` table), so different databases have independent label sets. Theme preference is persisted in a cookie; last DB path is also stored as a cookie for auto-resume on load (HTTP only — HTTPS uses FileHandles that can't be serialized).
- **Schema**: 3 main tables + `labels_prefs` — `columns`, `tasks` (`task_type`: 'epic'/'task', `parent_id`: INTEGER, `card_labels`: TEXT, `display_name`: TEXT), `comments`. Default columns ("To Do", "Blocked", "In Progress", "Done") defined in `DEFAULT_COLUMNS`.
- **Display name**: Optional per-task field that overrides the title on cards. Stored as `tasks.display_name` (TEXT). Auto-migrated via `ALTER TABLE` if column doesn't exist yet. If set and non-empty, displayed on cards instead of the canonical title; search still filters by title + description only.
- **Manage Labels** (`openLabelManager()`): Button in top bar opens a modal with per-label name, display alias (for card labels), color picker, and 🗑 delete button. Always closes any other active overlay first so it never stacks under them. Uses server's `kanban_prefs.json` via `/api/preferences?key=kanban_labels` to seed labels on new databases (falls back to hardcoded defaults).
- **Importing** a `.sqlite` file replaces in-memory state and calls `renderBoard()` — does NOT call autoSave(). Destructive: current board state is overwritten with no undo. Auto-save only works on HTTPS via the browser File System Access API; over HTTP you must manually save after each session.

## Security

**Comments are raw HTML.** Stored in `comments.body` as user-editable HTML from contenteditable divs. Always pass through `sanitizeHtml()` before inserting into innerHTML; it strips `<script>` tags, event handler attributes (`onclick`, etc.), and `javascript:` URLs while preserving safe formatting (bold, italic, code blocks, lists).

## Gotchas

- **FSA only works on HTTPS.** Chrome/Edge expose `showOpenFilePicker` / `showSaveFilePicker` on HTTP (localhost) even though they don't work there — always guard with `location.protocol === 'https:'` before checking for these features. All FSA checks in the app use this pattern.
- **Cookie-based resume is HTTP-only.** The last DB path is stored as a cookie (`kanban_db_path`) and auto-resumed on load via `openDatabaseViaServer()`. HTTPS users never get cookie resume (FileHandles can't be serialized). If resume fails, show setup dialog with a toast.
- **`openDatabaseViaServer()` returns boolean.** It must return `true` on success, `false` on cancel/empty path/failure — callers use `.then(success => success || showToast(...))`. Returning undefined (via bare return) triggers the error toast spuriously.
- **No UI update on soft-delete.** `softDeleteTask()` updates the DB and calls `autoSave()`, but does NOT call `renderBoard()`. Any caller (e.g. `quickDelete`) must explicitly call `renderBoard()` after deletion — otherwise cards vanish from their column but no refresh happens, leaving stale DOM state.
- **`locateFile` path must stay relative** (`'assets/' + file`). Absolute paths break WASM loading entirely.
- **Column deletion cascades manually**: comments → tasks → column (not DB CASCADE). Do not add `ON DELETE CASCADE` on the column_id side without implementing manual cleanup first.
- **Drag-and-drop uses fractional sort_order** (`sort_order - 0.5` between two cards). Full DOM re-render on every drop. Cards get `dragging` class via `setTimeout(() => ..., 0)` for CSS transition.
- **No undo buffer** — every edit commits immediately. Accidental deletes require restoring from an exported `.sqlite` file.
- **Column renaming uses native `prompt()` dialog** — no inline editing.
- **Labels are predefined presets** with customizable colors, display names, and aliases.
- **Column management** (rename, reorder, delete) is via right-click context menu.
- **Search** queries DB first then filters in-memory, not raw DOM — debounced at 250ms, filters title + description only. Does **not** auto-clear; user must press Escape to restore the board.
- **Enter in the task title input saves** the task instead of just adding whitespace.
- **Column schema migration**: old `.sqlite` files have `column_id INTEGER NOT NULL`; the app migrates it via a full table rewrite (`CREATE TABLE _mig AS SELECT * FROM tasks` → DROP → CREATE with `DEFAULT NULL`). Any new DB access path should guard on this or hit SQL errors when loading legacy databases.

## Soft-delete / Recycle bin

- **Deletion walk**: bottom-up DFS — comments first, then mark each descendant. Implemented in `cascadeSoft()`.
- **Parent ID never touched** during deletion → recovery is simply setting `deleted=0`; items reappear under their original parents automatically.
- **Migration runs** in four entrypoints: `initNewDB()`, `handleImport()`, `openExistingDatabase()`, and `softDeleteTask()` (for old databases).

## WYSIWYG editors / Comments

Three SunEditor instances managed by global variables:
- **`descEditor`** — task description in the detail modal (initialized in `openDetail()` after `openModal()`, destroyed in `closeDetailModal()`).
- **`commentEditor`** — new comment input (created in `toggleCommentEditor()`, destroyed on save/cancel).
- **`commentEditEditors`** — map of per-comment SunEditor instances for inline comment editing (created in `loadComments()` / `loadCommentsWithEditFlag()`, cleaned up in `destroyCommentEditors()` called by `renderComments()`).

All instances use `SUNEDITOR.create(id, config)` with a shared `EDITOR_CONFIG` object (line ~776 in `index.html`) that defines the full `buttonList` (bold, italic, underline, strike, fontColor, hiliteColor, removeFormat, font, fontSize, textStyle, lineHeight, formatBlock, paragraphStyle, blockquote, list, indent, outdent, align, table, horizontalRule, link, image, codeblock, quote, undo, redo) and `plugins` (`['image', 'table']`). Output is retrieved via `getContents()` and set via `setContents()`.

Descriptions from the DB are already HTML (stored via `sanitizeHtml(desc)`); the app detects plain text by checking for `<[a-z]>` tags and only converts `\n` to `<br>` for plain text.

Comments use raw HTML; always pass user input through `sanitizeHtml()` before rendering (strips `<script>`, event handlers, `javascript:` URLs). Pressing Escape on an open comment editor confirms unsaved changes.

## SunEditor gotchas

- **Init after `openModal()`** — SunEditor v2 cannot initialize on hidden elements. `descEditor` must be created after the detail modal is visible.
- **Element ID without `#` prefix** — `SUNEDITOR.create('detailDesc', ...)` not `'#detailDesc'` because v2 uses `getElementById()`.
- **Dark theme via CSS loading** — SunEditor v2 applies inline styles that CSS variables can't override. A separate `suneditor.min.dark.css` file is loaded/unloaded on theme toggle via `toggleTheme()` and on initial load via the IIFE. `initSunEditor()` syncs CSS at creation time to handle stale cookies.
- **`getContents()` / `setContents()`** — v2 API, not `getValue()` / `setValue()`.
- **`document.getElementById('newCommentText').focus()`** — `commentEditor.focus()` does not exist in v2.
- **Toolbar button names** — Not all buttons from the SunEditor docs exist in the minified build. `fontName`, `code`, `codeblock`, `template`, `quote`, `fullScreen`, `preview`, `charMap`, `specialChar` are not present in v2.47.11. Use `core` property check (not `core.contains()`) to detect active element inside editor for keyboard shortcuts.

## Task types & linking

- **Parent/child hierarchy**: Any task can reference another via `parent_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL`. Circular references are prevented by walking up the tree in `setParentTask()`. Epics display a 📁 badge with child count on the card.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` / `Cmd+K` | Focus search box |
| `Ctrl+T` / `Cmd+T` | Toggle dark/light theme |
| `Escape` | Close modals, context menus, cancel comment editor; clears search if focused |
