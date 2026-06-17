# Kanban Board

Offline-only kanban board running entirely in the browser with SQLite via WebAssembly. Single HTML file, zero dependencies, no build step.

## Structure

```
index.html          # Entire app — HTML + CSS + JS (1509 lines)
server.js           # Node.js HTTP server (WASM requires HTTP protocol)
start.sh            # Launcher: portable, auto-detects Node → Python fallback; runs backgrounded via nohup
assets/sql-wasm.js  # sql.js loader (~50KB)
assets/sql-wasm.wasm # SQLite WebAssembly binary (~650KB)
```

## Getting Started

```bash
./start.sh [port]    # default: 8089, starts in background (nohup)
node server.js [port] # foreground alternative
# Open http://localhost:<port>
```

- `start.sh` logs to `/tmp/kanban-server.log` on failure — check there if it won't start.
- **Python fallback port**: When no Node.js is installed, `start.sh` falls back to Python3 (port 8089) or legacy Python (port 8080). Only Node guarantees correct `.wasm` MIME type (`application/wasm`).
- Server is required: WASM files refuse to load over `file://`.

## Architecture Notes for Agents

- **Single-file app**: Everything lives in `index.html` (CSS in `<style>`, JS in `<script>`). No modules, no imports, no bundler. No package.json — zero tooling: no lint, typecheck, format, or test scripts exist. Manual edit-and-refresh only.
- **Database**: sql.js runs SQLite as WebAssembly in-memory. Loaded via `initSqlJs({ locateFile: file => 'assets/' + file })` — the relative path is critical; absolute paths will fail.
- **Persistence**: DB exports to base64 in `localStorage` key `kanban_db`. Uses chunked `String.fromCharCode.apply()` (32KB chunks) to avoid stack overflow on large databases. Theme stored separately in `kanban_theme`. localStorage quota is ~5-10MB; `autoSave()` warns at 80% but does not block writes after that point.
- **Schema**: 3 tables — `columns`, `tasks`, `comments`. Comments have `ON DELETE CASCADE` on task_id → tasks(id). Default columns seeded at init: "To Do", "Blocked", "In Progress", "Done". Existing databases without Blocked get a one-time migration via `migrateColumns()` (called in `init()` and `handleImport()`), which shifts In Progress sort_order 2→3, inserts Blocked at order 1, re-saves to localStorage.
- **No npm, no lockfile**. Pure static files served by a trivial HTTP server.

## Key Constraints & Gotchas

- `start.sh` does an explicit `cd "$(dirname "${BASH_SOURCE[0]}")" && pwd"` on line 2 before any server logic — preserving this is critical for all path resolution within the script. Uses backgrounded `nohup ... &`. To stop it: kill the PID or process name.
- Columns support a right-click context menu (rename, move left/right, delete) via `showColumnContextMenu()`. Escape key dismisses open menus.
- Importing a `.sqlite` file clears `kanban_db` from localStorage (imported DB lives only in memory until re-exported).
- Column deletion manually cascades: deletes comments → tasks → column (not using CASCADE because older sql.js versions had issues with it on nested deletes).
- Drag-and-drop uses native HTML5 API; no event library. Cards get `dragging` class via `setTimeout(() => ..., 0)` to allow CSS transition.
- Search is debounced at 250ms and filters both title and description against the rendered board only (not a full DB query).
- Comments have a delete button (`×`) alongside edit; `deleteComment()` runs a single-row DELETE then re-renders the comment list.

## WYSIWYG Editors

Task description (`#detailDesc`) and new comment input (`#newCommentText`) are `contenteditable` divs sharing a toolbar via `execCmd()`. The command scans all `.contenteditable-editor` elements for focus, runs the execCommand, then restores focus — works for both editors. Comment editor state is gated by a `commentEditorOpen` flag; Escape cancels an open comment editor. Rich text HTML stored in SQLite TEXT columns; card previews escape it for safe rendering and strip tags when displaying plain-text preview on cards.

## Keyboard Shortcuts & UX

| Shortcut | Action |
|---|---|
| `Ctrl+K` / `Cmd+K` | Focus search box |
| `Ctrl+T` / `Cmd+T` | Toggle dark/light theme |
| `Escape` | Close modals, context menus, cancel open comment editor; **if focused on search box, clears it** |
| `Enter` (in task modal) | Saves the task instead of doing nothing |

## Known Limitations

- No undo buffer — every edit is immediately committed. Accidental deletes are permanent unless you have a `.sqlite` export.
- Column renaming uses native `prompt()` dialog; no inline editing.
- Comments cannot be edited with rich text (only plain textarea), though they display rich HTML.
- No card color labels or tags support.
- Search does not auto-clear — must press Escape to dismiss, or delete manually.
- N+1 query eliminated for comment counts (batched per-column), but board re-renders the full DOM on every search keystroke rather than filtering visibility of existing elements.
