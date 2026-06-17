# Kanban Board — Agent Guide

Offline-only kanban board, single HTML file, zero dependencies, no build step. Runs entirely in the browser with SQLite via WebAssembly (sql.js).

## Structure

```
index.html          # Entire app (~1509 lines): CSS + JS inline
server.js           # Minimal Node HTTP server — port arg ignored (hardcoded 8089)
start.sh            # Launcher: `cd "$(dirname "${BASH_SOURCE[0]}")" && pwd` on line 2, then nohup background
assets/sql-wasm.*   # sql.js WASM loader + binary (~650KB)
```

## Commands

```bash
./start.sh [port]     # default: 8089, background via nohup → /tmp/kanban-server.log on failure
node server.js        # foreground (ignores port arg — hardcoded to 8089 in server.js)
pkill -f "kanban"     # stop the backgrounded launcher
```

Node.js preferred — only Node serves `.wasm` with correct MIME type. Python fallback (`start.sh`) may fail with WASM errors.

## Architecture

- **Single file**: `index.html` contains `<style>`, `<script src="assets/sql-wasm.js">`, and all JS. No modules, no bundler, no package.json.
- **Database**: sql.js (SQLite as WebAssembly) runs in-memory. Loaded via `initSqlJs({ locateFile: file => 'assets/' + file })` — the relative path is critical; absolute paths fail.
- **Persistence**: DB exported to base64 in `localStorage` key `kanban_db`. Uses chunked `String.fromCharCode.apply()` (32KB chunks) to avoid stack overflow. Theme stored separately in `kanban_theme`. Auto-save warns at 80% localStorage quota (~4.5MB) but does not block writes after that point.
- **Schema**: 3 tables — `columns`, `tasks`, `comments` (`ON DELETE CASCADE` on task_id). Default columns: "To Do", "Blocked", "In Progress", "Done". Legacy databases without Blocked get a one-time migration via `migrateColumns()` (called in `init()` and `handleImport()`): shifts sort_order +1 for non-To-Done columns, inserts Blocked at order 1.

## Key Constraints & Gotchas

- **Column deletion** cascades manually: comments → tasks → column (not DB CASCADE — older sql.js had nested delete issues).
- **Drag-and-drop**: native HTML5 API; cards get `dragging` class via `setTimeout(() => ..., 0)` for CSS transition. Insert position between two cards uses fractional `sort_order - 0.5`. Full DOM re-render on every drop.
- **Search** is debounced at 250ms, filters title + description only (not comments), operates on rendered board not raw DB. Does not auto-clear — must press Escape manually.
- **Importing** a `.sqlite` file clears `kanban_db` from localStorage (imported DB lives in memory until re-exported).
- **Column renaming** uses native `prompt()` dialog; no inline editing. Right-click context menu (`showColumnMenu()`) on column handle: rename, move left/right, delete. Escape dismisses menus.

## WYSIWYG Editors

`#detailDesc` (task description) and `#newCommentText` (comment input) are `contenteditable` divs sharing a toolbar via `execCmd()` — scans `.contenteditable-editor` elements for active focus, runs execCommand, restores focus. Rich text HTML stored in SQLite TEXT; card previews escape it and strip tags for plain-text display. Comment editor state gated by `commentEditorOpen` flag; Escape cancels open comment editor (with unsaved-content confirm). Comments are edited as plain textarea but display rich HTML.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` / `Cmd+K` | Focus search box |
| `Ctrl+T` / `Cmd+T` | Toggle dark/light theme |
| `Escape` | Close modals/context menus; cancel comment editor; if focused on search, clears it and re-renders board |
| `Enter` (task title input) | Saves task instead of doing nothing |

## Known Limitations

- No undo — every edit is immediately committed. Accidental deletes require `.sqlite` export restore.
- Comments: plain textarea for editing, rich HTML for display.
- No card color labels or tags.
- Full DOM re-render on every search keystroke (visibility filtering was replaced).
- N+1 comment count query eliminated via batched per-column IN-clause.
