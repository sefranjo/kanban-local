# Kanban Board

Offline-only kanban board running entirely in the browser with SQLite via WebAssembly. Single HTML file, zero dependencies, no build step.

## Structure

```
index.html          # Entire app — HTML + CSS + JS (~1200 lines)
server.js           # Node.js HTTP server (WASM requires HTTP protocol)
start.sh            # Launcher: auto-detects Node → Python fallback; runs backgrounded via nohup
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
- Server is required: WASM files refuse to load over `file://`.

## Architecture Notes for Agents

- **Single-file app**: Everything lives in `index.html` (CSS in `<style>`, JS in `<script>`). No modules, no imports, no bundler.
- **Database**: sql.js runs SQLite as WebAssembly in-memory. Loaded via `initSqlJs({ locateFile: file => 'assets/' + file })` — the relative path is critical; absolute paths will fail.
- **Persistence**: DB exports to base64 in `localStorage` key `kanban_db`. Uses chunked `String.fromCharCode.apply()` (32KB chunks) to avoid stack overflow on large databases. Theme stored separately in `kanban_theme`.
- **Schema**: 3 tables — `columns`, `tasks`, `comments` (CASCADE delete via `ON DELETE CASCADE` on comments → tasks).
- **No npm, no package.json, no lockfile**. Pure static files served by a trivial HTTP server.

## Key Constraints & Gotchas

- `start.sh` always runs the server in background (`nohup ... &`). To stop it: kill the PID or process name.
- Importing a `.sqlite` file clears `kanban_db` from localStorage (imported DB lives only in memory until re-exported).
- Column deletion manually cascades: deletes comments → tasks → column (not using CASCADE because older sql.js versions had issues with it on nested deletes).
- Drag-and-drop uses native HTML5 API; no event library. Cards get `dragging` class via `setTimeout(() => ..., 0)` to allow CSS transition.
- Search isDebounced at 250ms and filters both title and description against the rendered board only (not a full DB query).

## WYSIWYG Editors

Both task description (`#detailDesc`) and new comment input (`#newCommentText`) use `contenteditable` divs with shared toolbar buttons (Bold, Italic, Underline, Strikethrough, Bullet list, Numbered list, Code block) calling `execCmd()`. The `execCmd()` function scans all `.contenteditable-editor` elements to find whichever has focus, runs the command, then restores focus — so it works for both editors regardless of which toolbar button is clicked.

Comment editor state is gated by a `commentEditorOpen` flag. When open, "+ Add Comment" hides and is replaced by Accept/Cancel buttons below the editor. Escape key cancels an open comment editor. Rich text HTML is stored in SQLite TEXT columns; card previews escape it for safe rendering.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` / `Cmd+K` | Focus search box |
| `Ctrl+T` / `Cmd+T` | Toggle dark/light theme |
| `Escape` | Close modals, context menus, and cancel open comment editor |
