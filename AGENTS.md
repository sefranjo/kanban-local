# Kanban Board — Agent Guide

Single-file app (`index.html`, ~3207 lines), zero dependencies, no build step. SQLite via sql.js WebAssembly runs in-browser; Node HTTP server serves `.wasm` with correct MIME type and provides disk persistence API endpoints. (Line count drifts as features evolve.)

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

- **Single file**: `index.html` (~3207 lines) — CSS `<style>`, inline JS, no build step or dependencies.
- **Database**: sql.js (SQLite WebAssembly) runs in-memory via `initSqlJs({ locateFile: file => 'assets/' + file })`. WASM binary at `assets/sql-wasm.wasm` (~650KB), JS loader at `assets/sql-wasm.js` (~50KB).
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

## Soft-delete / Recycle bin

Tasks are soft-deleted (`deleted=1`) via bottom-up DFS (deleting comments first, then marking each descendant). The `parent_id` column is never modified during deletion, so recovery sets `deleted=0` and items reappear under their original parents automatically. ALTER TABLE migration runs in `initNewDB()`, `handleImport()`, and `openExistingDatabase()` via TRY/CATCH, plus `softDeleteTask()` for old databases. Both the column-deletion flow and task-delete path (`quickDelete`) use `softDeleteTask()` now.

## WYSIWYG editors / Comments

Comments use raw HTML in contenteditable divs; always pass user input through `sanitizeHtml()` before rendering (strips `<script>`, event handlers, `javascript:` URLs). A global `paste` listener sanitizes pasted content. Pressing Escape on an open comment editor confirms unsaved changes.

## Task types & linking

- **Parent/child hierarchy**: Any task can reference another via `parent_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL`. Circular references are prevented by walking up the tree in `setParentTask()`. Epics display a 📁 badge with child count on the card.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` / `Cmd+K` | Focus search box |
| `Ctrl+T` / `Cmd+T` | Toggle dark/light theme |
| `Escape` | Close modals, context menus, cancel comment editor; clears search if focused |

