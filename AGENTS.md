# Kanban Board — Agent Guide

Offline-only kanban board: single HTML file (`index.html`, ~1804 lines), zero dependencies, no build step. Runs in-browser with SQLite via WebAssembly (sql.js).

## Run commands

```bash
./start.sh [port]       # default 8089, background via nohup → /tmp/kanban-server.log on failure
node server.js          # foreground — port arg is **ignored**, hardcoded to 8089
pkill -f "server.js"    # stop the backgrounded launcher (or pkill -f "python3")
```

**Node.js required.** Only Node serves `.wasm` with correct `application/wasm` MIME type. Python fallback in `start.sh` fails at runtime.

## Architecture

- **Single file**: `index.html` — CSS in `<style>`, all JS inline, no modules/bundler/package.json. Manual edit-and-refresh is the workflow.
- **Database**: sql.js (SQLite as WebAssembly) runs in-memory. Loaded via `initSqlJs({ locateFile: file => 'assets/' + file })`. WASM binary is `assets/sql-wasm.wasm` (~650KB).
- **Persistence**: DB exported to base64 in `localStorage["kanban_db"]`. Chunked `String.fromCharCode.apply()` (32KB chunks) avoids stack overflow. Theme stored separately in `kanban_theme`. Auto-save warns at 80% localStorage quota but does not block writes after that point.
- **Schema**: 3 tables — `columns`, `tasks` (with `task_type` TEXT ['epic','task'] + `parent_id` INTEGER), `comments`. Default columns: "To Do", "Blocked", "In Progress", "Done". Legacy DBs without Blocked get one-time migration via `migrateColumns()` (called in `init()` and `handleImport()`): shifts sort_order +1 for non-To-Done columns, inserts Blocked at order 1. Task schema migration via `migrateTaskSchema()` adds `task_type` + `parent_id` with defaults; catch-and-continue on ALTER TABLE error if already present.
- **No build/lint/typecheck scripts**. No package manager, no lockfile.

## Agent-critical gotchas

- **`locateFile` path must stay relative** (`'assets/' + file`) — absolute paths break WASM loading entirely.
- **Column deletion cascades manually**: comments → tasks → column (not DB CASCADE). Do not add `ON DELETE CASCADE` on the column_id side without implementing manual cleanup first.
- **Search operates on rendered DOM, not raw DB** — debounced at 250ms, filters title + description only. Does not auto-clear; user must press Escape to restore the board.
- **Drag-and-drop uses fractional sort_order** (`sort_order - 0.5` between two cards). Full DOM re-render on every drop. Cards get `dragging` class via `setTimeout(() => ..., 0)` for CSS transition.
- **Importing a `.sqlite` file clears `kanban_db` from localStorage** — the imported DB lives in memory only until re-exported. This is a destructive side effect to watch for.
- **No undo buffer** — every edit commits immediately. Accidental deletes require restoring from an exported `.sqlite` file.
- **Delete cascades children recursively** — deleting a task with child tasks removes all grandchildren and their comments automatically via `quickDelete()` and `deleteTaskFromModal()`.

## WYSIWYG editors

`#detailDesc` (task description) and `#newCommentText` (comment input) are `contenteditable` divs sharing a toolbar via `execCmd()`. The function scans `.contenteditable-editor` elements for active focus, runs execCommand, then restores focus. Rich text HTML is stored in SQLite TEXT; card previews escape it and strip tags for plain-text display.

Comment editor state is gated by the `commentEditorOpen` flag; Escape cancels an open comment editor (with unsaved-content confirmation). Comments are edited via a `<textarea>` but displayed as rich HTML. Comment editing uses a DOM marker element (`#_editingComment_N`) to track which comment is being edited, rather than keeping edit state in memory.

## Task Types & Linking

- **Task type**: `task_type` column — `'epic'` or `'task'`. Epics display a 📁 badge with child count on the card.
- **Parent/child hierarchy**: Any task can reference another via `parent_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL`. Detail modal has a "Linked Tasks" section for managing links (dropdown to pick parent, list of children). Circular references are prevented by walking up the tree in `setParentTask()`.
- **Type selector populates both modals**: When opening detail modal via `openDetail()`, both `#taskTypeSelect` and `#detailTaskTypeSelect` must be populated. Use `populateTypeSelect()` for the add-task modal, then manually populate `#detailTaskTypeSelect` in `openDetail()`.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` / `Cmd+K` | Focus search box |
| `Ctrl+T` / `Cmd+T` | Toggle dark/light theme |
| `Escape` | Close modals/context menus; cancel comment editor (with confirm); if focused on search, clears it and re-renders board |
| `Enter` (task title input) | Saves task instead of doing nothing |
