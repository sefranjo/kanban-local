# kanban-local

An offline-only Kanban board that runs entirely in the browser with SQLite via WebAssembly. Single HTML file, zero dependencies, no build step.

## Features

- **Drag-and-drop** cards between columns using native HTML5 API
- **Task types** — create Epic tasks (for projects) or regular Tasks. Epics display a 📁 badge with child count on the card
- **Parent/child linking** — any task can be linked as a child of another. Detail modal shows a "Linked Tasks" section for managing hierarchy with circular-reference prevention
- **Rich text editing** for task descriptions and comments (bold, italic, lists, code blocks)
- **Persistent storage** — database saved to localStorage as base64, with import/export via `.sqlite` files
- **Dark/light theme** toggle (`Ctrl+T` / `Cmd+T`)
- **Search** across all cards with debounced filtering (`Ctrl+K` / `Cmd+K`)
- **Column management** — rename, reorder (move left/right), delete via right-click context menu
- **Comments** on tasks with edit and delete support

## Getting Started

### Prerequisites

A local HTTP server is required because WebAssembly refuses to load over `file://`. Node.js preferred for correct `.wasm` MIME type.

### Run

```bash
# Option 1: Use the launcher script (auto-detects available runtime)
./start.sh [port]    # default port: 8089, starts in background via nohup

# Option 2: Start directly with Node.js (foreground)
node server.js [port]   # default port: 8089

# Open your browser:
open http://localhost:8089
```

**Note:** If Node.js is not installed, `start.sh` falls back to Python3 (port 8089) or legacy Python (port 8080). Only Node guarantees correct `.wasm` MIME type (`application/wasm`).

### Stop the server

The launcher starts backgrounded via nohup. Kill with:
```bash
pkill -f "node server.js"
# or
pkill -f "python3 -m http.server"
```

## Project Structure

```
index.html          # Entire application (~1804 lines): HTML + CSS + JS
server.js           # Minimal Node.js HTTP server (WASM requires HTTP protocol)
start.sh            # Launcher with portable path detection and nohup backgrounding
assets/sql-wasm.js  # sql.js WASM loader (~50KB)
assets/sql-wasm.wasm # SQLite WebAssembly binary (~650KB)
```

## Architecture Highlights

- **Single-file app**: Everything lives in `index.html` — CSS in `<style>`, JavaScript in `<script>`. No modules, no imports, no bundler.
- **Database**: Uses [sql.js](https://github.com/sql-js/sql.js) to run SQLite as WebAssembly entirely in-memory. Loaded via `initSqlJs({ locateFile: file => 'assets/' + file })` — relative path is critical.
- **Persistence**: Database exported to base64 and stored in `localStorage` key `kanban_db`. Uses chunked `String.fromCharCode.apply()` (32KB chunks) to avoid stack overflow on large databases. Theme stored separately in `kanban_theme`.
- **Schema**: 3 tables — `columns`, `tasks` (with `task_type`: 'epic' or 'task', and `parent_id` for linking tasks), `comments`. Default columns seeded at init: "To Do", "Blocked", "In Progress", "Done". Existing databases are migrated automatically via `migrateTaskSchema()` which adds the new columns with safe defaults.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` / `Cmd+K` | Focus search box |
| `Ctrl+T` / `Cmd+T` | Toggle dark/light theme |
| `Escape` | Close modals, context menus, cancel comment editor; if focused on search box, clears it |
| `Enter` (in task modal) | Saves the task instead of doing nothing |

## Limitations

- No undo buffer — every edit is immediately committed. Export `.sqlite` to preserve state.
- Column renaming uses native `prompt()` dialog; no inline editing.
- Comments cannot be edited with rich text (plain textarea only), though they display rich HTML.
- No card color labels or tags support.
- Search does not auto-clear — must press Escape manually.

## Development Notes

This project has no build step, no package manager, and no lint/typecheck/format scripts. Manual edit-and-refresh in the browser is the entire development workflow.
