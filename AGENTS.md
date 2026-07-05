# Kanban Board — Agent Guide

Single-file app (`index.html`, 2710 lines), zero dependencies, no build step. SQLite via sql.js WebAssembly runs in-browser; Node HTTP server serves `.wasm` with correct MIME type and provides disk persistence API endpoints.

## Run commands

```bash
./start.sh [port]       # default 8089, starts `node server.js` via nohup
node server.js          # foreground — always binds to 8089 (ignores CLI args)
pkill -f "node server"  # stop
```

**Node.js required.** Python fallback in `start.sh` serves static files but has **no API support**, so save/open features will not work. Server log goes to `/tmp/kanban-server.log`.

## Port quirk

`server.js:226` hardcodes `PORT = 8089` — it reads no CLI arguments. The port arg to `start.sh` only affects the startup message, not the actual server. To change ports you must edit `server.js`.

## Server API (for disk persistence)

The browser never writes directly to disk over plain HTTP (`file://`). On HTTP a Node server provides four endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/setup-save` | POST `{ path }` | Record where next `save-db` should write (validates `.sqlite`/`.db`) |
| `/api/save-db` | POST `{ data: "<base64>" }` | Atomically writes DB to the recorded path via a temp file + rename |
| `/api/open-file` | POST `{ path }` | Streams a local `.sqlite` as binary response (`Content-Type: application/octet-stream`) |
| `/api/list?path=<encoded>` | GET | Directory listing filtered to interesting files (`.sqlite`, `.db`, dirs) |

The server also maintains **preferences** in `kanban_prefs.json` (read/written via `/api/preferences`). This is separate from per-database labels.

## Development workflow

Manual edit-and-refresh only — no build step, no package manager, no lint/typecheck/format scripts. Don't look for test or type scripts; they don't exist.

## Architecture

- **Single file**: `index.html` (2710 lines) — CSS `<style>`, inline JS, no modules/bundler/package.json.
- **Database**: sql.js (SQLite WebAssembly) runs in-memory via `initSqlJs({ locateFile: file => 'assets/' + file })`. WASM binary at `assets/sql-wasm.wasm` (~650KB), JS loader at `assets/sql-wasm.js` (~50KB).
- **Persistence**: DB exported to base64 and saved either via browser File System Access API (HTTPS) or the Node server's `/api/save-db` (HTTP). Labels are stored inside each `.sqlite` file itself (`labels_prefs(key, value TEXT)` table), so different databases have independent label sets. Theme toggle state is persisted per-database as well.
- **Schema**: 3 main tables + `labels_prefs` — `columns`, `tasks` (`task_type`: 'epic'/'task', `parent_id`: INTEGER, `card_labels`: TEXT, `display_name`: TEXT), `comments`. Default columns ("To Do", "Blocked", "In Progress", "Done") defined in `DEFAULT_COLUMNS`.
- **Display name**: Optional per-task field that overrides the title on cards. Stored as `tasks.display_name` (TEXT). Auto-migrated via `ALTER TABLE` if column doesn't exist yet. If set and non-empty, displayed on cards instead of the canonical title; search still filters by title + description only.
- **Manage Labels** (`openLabelManager()`): Button in top bar opens a modal with per-label name, display alias (for card labels), color picker, and 🗑 delete button. Always closes any other active overlay first so it never stacks under them. Uses server's `kanban_prefs.json` via `/api/preferences?key=kanban_labels` to seed labels on new databases (falls back to hardcoded defaults).
- **Importing** a `.sqlite` file replaces and re-saves the DB — calls `autoSave()` at `handleImport()`. Destructive: current browser state is overwritten with no undo.

## Security

**Comments are raw HTML.** Stored in `comments.body` as user-editable HTML from contenteditable divs. Always pass through `sanitizeHtml()` before inserting into innerHTML; it strips `<script>` tags, event handler attributes (`onclick`, etc.), and `javascript:` URLs while preserving safe formatting (bold, italic, code blocks, lists).

## Gotchas

- **`locateFile` path must stay relative** (`'assets/' + file`). Absolute paths break WASM loading entirely.
- **Column deletion cascades manually**: comments → tasks → column (not DB CASCADE). Do not add `ON DELETE CASCADE` on the column_id side without implementing manual cleanup first.
- **Drag-and-drop uses fractional sort_order** (`sort_order - 0.5` between two cards). Full DOM re-render on every drop. Cards get `dragging` class via `setTimeout(() => ..., 0)` for CSS transition.
- **No undo buffer** — every edit commits immediately. Accidental deletes require restoring from an exported `.sqlite` file.
- **Column renaming uses native `prompt()` dialog** — no inline editing.
- **Labels are predefined presets** with customizable colors, display names, and aliases.
- **Column management** (rename, reorder, delete) is via right-click context menu.
- **Search** queries DB first then filters in-memory, not raw DOM — debounced at 250ms, filters title + description only. Does **not** auto-clear; user must press Escape to restore the board.
- **Delete cascades children recursively** — `deleteTaskCascade()` walks the full tree depth-first. Both `deleteTaskFromModal()` and `quickDelete()` use it. Does NOT delete tasks that become orphaned via `ON DELETE SET NULL` (great-grandchildren of a deleted task stay).
- **Enter in the task title input saves** the task instead of just adding whitespace.

## WYSIWYG editors / Comments

`#detailDesc` (task description) and `#newCommentText` (comment input) are contenteditable divs sharing a toolbar via `execCmd()`. The function scans all `.contenteditable-editor` elements for active focus, runs execCommand, then restores focus.

Comment editor state is gated by the `commentEditorOpen` flag; Escape cancels an open comment editor with unsaved-content confirmation. Comment editing uses a DOM marker element (`_editingComment_N`) to track which comment is being edited, rather than keeping edit state in memory.

**Toolbar population**: `populateToolbar()` is called on `DOMContentLoaded` and after each comment render. Dynamically rendered comment edit views get their toolbars populated at the end of the render functions.

**Paste sanitization**: A global `paste` event listener intercepts pastes into contenteditable editors and passes HTML through `sanitizeHtml()` before inserting, stripping `<script>` tags, event handlers, and `javascript:` URLs.

## Task types & linking

- **Both type selectors must be populated on open**: When opening detail modal via `openDetail()`, populate both `#taskTypeSelect` and `#detailTaskTypeSelect`. Use `populateTypeSelect()` for the add-task modal, then manually populate `#detailTaskTypeSelect` in `openDetail()`.
- **Parent/child hierarchy**: Any task can reference another via `parent_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL`. Circular references are prevented by walking up the tree in `setParentTask()`. Epics display a 📁 badge with child count on the card.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` / `Cmd+K` | Focus search box |
| `Ctrl+T` / `Cmd+T` | Toggle dark/light theme |
| `Escape` | Close modals, context menus, cancel comment editor; clears search if focused |

