# Kanban Board — Agent Guide

Offline-only kanban board: single HTML file, zero dependencies, no build step. Runs entirely in the browser with SQLite via WebAssembly (sql.js).

## Run commands

```bash
./start.sh [port]       # default 8089, background via nohup → /tmp/kanban-server.log on failure
node server.js          # foreground — port arg is ignored (hardcoded 8089 in server.js)
pkill -f "kanban"       # stop the backgrounded launcher
```

**Node.js required for development.** Only Node serves `.wasm` with correct `application/wasm` MIME type. Python fallback (`start.sh`) will fail at runtime with WASM errors.

## Architecture

- **Single file**: `index.html` (1542 lines) — CSS in `<style>`, all JS inline. No modules, no bundler, no package.json. Manual edit-and-refresh is the entire workflow.
- **Database**: sql.js (SQLite as WebAssembly) runs in-memory. Loaded via `initSqlJs({ locateFile: file => 'assets/' + file })` — **relative path is critical; absolute paths fail**.
- **Persistence**: DB exported to base64 in `localStorage["kanban_db"]`. Uses chunked `String.fromCharCode.apply()` (32KB chunks) to avoid stack overflow. Theme stored separately in `kanban_theme`. Auto-save warns at 80% localStorage quota (~4.5MB) but does not block writes after that point.
- **Schema**: 3 tables — `columns`, `tasks`, `comments` (`ON DELETE CASCADE` on task_id). Default columns: "To Do", "Blocked", "In Progress", "Done". Legacy databases without Blocked get a one-time migration via `migrateColumns()` (called in `init()` and `handleImport()`): shifts sort_order +1 for non-To-Done columns, inserts Blocked at order 1.

## Agent-critical gotchas

- **`locateFile` path must stay relative** — changing it to an absolute path breaks WASM loading entirely.
- **Column deletion cascades manually**: comments → tasks → column (not DB CASCADE). Do not add `ON DELETE CASCADE` on the column_id side without implementing manual cleanup first — older sql.js had nested delete issues.
- **Search operates on rendered DOM, not raw DB** — debounced at 250ms, filters title + description only (not comments). Does not auto-clear; user must press Escape manually to restore the board.
- **Drag-and-drop uses fractional sort_order** (`sort_order - 0.5` between two cards). Full DOM re-render on every drop. Cards get `dragging` class via `setTimeout(() => ..., 0)` for CSS transition.
- **Importing a `.sqlite` file clears `kanban_db` from localStorage** — the imported DB lives in memory only until re-exported. This is a destructive side effect to watch for.
- **No undo buffer** — every edit commits immediately. Accidental deletes require restoring from an exported `.sqlite` file.

## WYSIWYG editors

`#detailDesc` (task description) and `#newCommentText` (comment input) are `contenteditable` divs sharing a toolbar via `execCmd()`. The function scans `.contenteditable-editor` elements for active focus, runs execCommand, then restores focus. Rich text HTML is stored in SQLite TEXT; card previews escape it and strip tags for plain-text display.

Comment editor state is gated by the `commentEditorOpen` flag; Escape cancels an open comment editor (with unsaved-content confirmation). Comments are edited as a plain `<textarea>` but displayed as rich HTML.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` / `Cmd+K` | Focus search box |
| `Ctrl+T` / `Cmd+T` | Toggle dark/light theme |
| `Escape` | Close modals/context menus; cancel comment editor (with confirm); if focused on search, clears it and re-renders board |
| `Enter` (task title input) | Saves task instead of doing nothing |
