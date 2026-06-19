# Kanban Board — Agent Guide

Single-file app (`index.html`), zero dependencies, no build step. SQLite via sql.js WebAssembly runs in-browser; Node HTTP server serves `.wasm` with correct MIME type.

## Run commands

```bash
./start.sh [port]       # default 8089, starts `node server.js` in background via nohup
node server.js          # foreground — port arg is ignored, hardcoded to PORT = 8089 (server.js:6)
pkill -f "node server.js"   # stop
```

**Node.js required.** Only Node serves `.wasm` with `application/wasm` MIME type (`server.js:14`). Python fallback in `start.sh` fails at runtime.

## Port quirk

`start.sh` accepts a port arg and passes it to itself, but `server.js` ignores CLI args entirely — it always binds to 8089. The port arg to `start.sh` only affects the startup message, not the actual server.

## Architecture

- **Single file**: `index.html` (~2224 lines) — CSS `<style>`, inline JS, no modules/bundler/package.json. Manual edit-and-refresh is the workflow.
- **Database**: sql.js (SQLite WebAssembly) runs in-memory via `initSqlJs({ locateFile: file => 'assets/' + file })`. WASM binary at `assets/sql-wasm.wasm` (~650KB), JS loader at `assets/sql-wasm.js` (~50KB).
- **Persistence**: DB exported to base64 and stored in `localStorage["kanban_db"]`. Uses chunked `String.fromCharCode.apply()` (32KB chunks) to avoid stack overflow. Theme stored separately in `kanban_theme`. Auto-save warns at 80% localStorage quota but does not block writes after that point.
- **Schema**: 3 tables — `columns`, `tasks` (`task_type`: 'epic'/'task', `parent_id`: INTEGER, `card_labels`: TEXT), `comments`. Default columns ("To Do", "Blocked", "In Progress", "Done") defined in `DEFAULT_COLUMNS` at index.html:714.
- **Importing** a `.sqlite` file replaces and re-saves the DB — calls `autoSave()` at `handleImport()`. Destructive: current browser DB is overwritten with no undo.

## Security

- **Comments are raw HTML** — stored in `comments.body` as user-editable HTML from a contenteditable div. Always pass through `sanitizeHtml()` (index.html:1109) before inserting into innerHTML; it strips `<script>` tags, event handler attributes (`onclick`, etc.), and `javascript:` URLs while preserving safe formatting.

## Gotchas

- **`locateFile` path must stay relative** (`'assets/' + file`) — absolute paths break WASM loading entirely.
- **Column deletion cascades manually**: comments → tasks → column (not DB CASCADE). Do not add `ON DELETE CASCADE` on the column_id side without implementing manual cleanup first.
- **Drag-and-drop uses fractional sort_order** (`sort_order - 0.5` between two cards). Full DOM re-render on every drop. Cards get `dragging` class via `setTimeout(() => ..., 0)` for CSS transition.
- **No undo buffer** — every edit commits immediately. Accidental deletes require restoring from an exported `.sqlite` file.
- **Column renaming uses native `prompt()` dialog** — no inline editing.
- **Labels are predefined presets** with customizable colors and display names.
- **Column management** (rename, reorder, delete) is via right-click context menu.
- **Search** operates on rendered DOM, not raw DB — debounced at 250ms, filters title + description only. Does **not** auto-clear; user must press Escape to restore the board.
- **Delete cascades children recursively** — `deleteTaskCascade()` at index.html:1271 walks the full tree depth-first. Both `deleteTaskFromModal()` (index.html:1344) and `quickDelete()` (index.html:1366) use it. Does NOT delete tasks that become orphaned via `ON DELETE SET NULL` (great-grandchildren of a deleted task stay).
- **Enter in the task title input saves** the task instead of just adding whitespace — see keydown handler at index.html:2201.

## Schema migrations

Both column and task schema migrations use per-statement try/catch to tolerate pre-existing columns. **Do not fight ALTER TABLE errors** — they are silently swallowed when columns already exist.
- `migrateColumns()` at index.html:748: shifts sort_order +1 for non-To-Done/Done columns, inserts "Blocked" at order 1. Called in `init()` (index.html:737) and `handleImport()` at index.html:915.
- `migrateTaskSchema()` at index.html:763: adds `task_type`, `parent_id`, and `card_labels` with safe defaults via individual try/catch blocks per ALTER TABLE.

## WYSIWYG editors / Comments

`#detailDesc` (task description, index.html:616) and `#newCommentText` (comment input, index.html:630) are `contenteditable` divs sharing a toolbar via `execCmd()` at index.html:1386. The function scans all `.contenteditable-editor` elements for active focus, runs execCommand, then restores focus.

Comment editor state is gated by the `commentEditorOpen` flag (index.html:1418); Escape cancels an open comment editor with unsaved-content confirmation. Comment editing uses a DOM marker element (`_editingComment_N`, index.html:1710) to track which comment is being edited, rather than keeping edit state in memory.

**Toolbar population**: `populateToolbar()` at index.html:698 is called on `DOMContentLoaded` and after each comment render. Dynamically rendered comment edit views (via `loadCommentsWithEditFlag`) get their toolbars populated by calling it at the end of the render functions.

**Paste sanitization**: A global `paste` event listener (index.html:1409) intercepts pastes into contenteditable editors and passes pasted HTML through `sanitizeHtml()` before inserting it, stripping `<script>` tags, event handlers, and `javascript:` URLs.

## Task types & linking

- **Both type selectors must be populated on open**: When opening detail modal via `openDetail()` (index.html:1444), populate both `#taskTypeSelect` and `#detailTaskTypeSelect`. Use `populateTypeSelect()` at index.html:2075 for the add-task modal, then manually populate `#detailTaskTypeSelect` in `openDetail()`.
- **Parent/child hierarchy**: Any task can reference another via `parent_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL`. Circular references are prevented by walking up the tree in `setParentTask()` at index.html:1590. Epics display a 📁 badge with child count on the card.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` / `Cmd+K` | Focus search box |
| `Ctrl+T` / `Cmd+T` | Toggle dark/light theme |
| `Escape` | Close modals, context menus, cancel comment editor; clears search box if focused |
