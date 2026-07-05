# kanban-local

An offline-only Kanban board that runs entirely in the browser with SQLite via WebAssembly. Single HTML file, zero dependencies, no build step.

## Features

- **Drag-and-drop** cards between columns using native HTML5 API
- **Task types** — create Epic tasks (for projects) or regular Tasks. Epics display a 📁 badge with child count on the card
- **Parent/child linking** — any task can be linked as a child of another. Detail modal shows "Linked Tasks" for managing hierarchy with circular-reference prevention
- **Rich text editing** for descriptions and comments (bold, italic, underline, strikethrough, lists, code blocks)
- **Persistent storage** — database saved to `.sqlite` files via File System Access API (HTTPS) or Node.js server proxy (HTTP). Auto-save enabled after opening/creating a file.
- **Per-database labels** — each `.sqlite` file stores its own label presets (name, display alias, color) inside the DB. Open `a.sqlite`, edit labels; open `b.sqlite` — its labels are unaffected.
- **Dark/light theme** toggle (`Ctrl+T` / `Cmd+T`)
- **Search** across all cards with debounced filtering (`Ctrl+K` / `Cmd+K`)
- **Column management** — rename, reorder (move left/right), delete via right-click context menu
- **Comments** on tasks with edit and delete support

## Getting Started

### Prerequisites

A local HTTP server is required because WebAssembly refuses to load over `file://`. Node.js preferred for correct `.wasm` MIME type (`application/wasm`). Python fallback in `start.sh` fails at runtime.

### Run

```bash
./start.sh [port]       # default 8089, starts via nohup in background
node server.js          # foreground — always binds to port 8089 (ignores CLI args)
pkill -f "node server"  # stop
```

### Open your browser

Navigate to `http://localhost:8089`. You'll see the setup dialog where you can create a new database or open an existing `.sqlite` file. The interface includes buttons for creating and opening files with a built-in file picker.

## Project Structure

```
index.html          # Entire application (2661 lines): HTML + CSS + JS
server.js           # Minimal Node.js HTTP server (283 lines) — serves static files, handles API endpoints, writes .sqlite to disk
start.sh            # Launcher with portable path detection and nohup backgrounding
assets/sql-wasm.js  # sql.js WASM loader (~50KB)
assets/sql-wasm.wasm # SQLite WebAssembly binary (~650KB)
kanban_prefs.json   # Preferences (currently empty; label prefs are stored per-database in the .sqlite file itself)
README.md           # You are reading this
AGENTS.md           # AI agent instructions — helps agents ramp up and avoid mistakes
```

## Architecture Highlights

- **Single-file app**: Everything lives in `index.html` — CSS, JavaScript, no modules, no imports, no bundler. Manual edit-and-refresh is the development workflow.
- **Database**: Uses [sql.js](https://github.com/sql-js/sql.js) to run SQLite as WebAssembly entirely in-memory, loaded via `initSqlJs({ locateFile: file => 'assets/' + file })` — relative path is critical; absolute paths break WASM loading.
- **Server-side storage**: The browser never writes directly to disk (except on HTTPS with File System Access API). On HTTP, a Node.js server handles all persistence via `/api/save-db` and `/api/open-file`.
- **Label prefs per-database**: Labels are stored inside the SQLite file itself in a `labels_prefs(key, value TEXT)` table. Opening different databases shows independent label sets — changing labels in one doesn't affect another.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` / `Cmd+K` | Focus search box |
| `Ctrl+T` / `Cmd+T` | Toggle dark/light theme |
| `Escape` | Close modals, context menus, cancel comment editor; clears search if focused |
| `Enter` (in task title input) | Saves the task instead of just adding whitespace |

## Limitations

- No undo buffer — every edit is immediately committed. Export `.sqlite` to preserve state before making risky changes.
- Column renaming uses native `prompt()` dialog; no inline editing.
- Comments are raw HTML (contenteditable) and must pass through `sanitizeHtml()` before display — strips `<script>` tags, event handler attributes, and `javascript:` URLs while preserving safe formatting.
- Labels are predefined presets with customizable colors, display names, and aliases.

## Development Notes

This project has no build step, no package manager, no lint/typecheck/format scripts. Manual edit-and-refresh in the browser is the entire development workflow.

---

## Made with

This small project has been made thanks to the creators of the following tools:

- [LM Studio](https://github.com/lmstudio-ai)
- [OpenCode](https://github.com/anomalyco/opencode)
- [Qwen3.6](https://github.com/QwenLM/Qwen3.6)
- [Qwen3.6 modified by mulder](https://huggingface.co/mudler/Qwen3.6-35B-A3B-APEX-GGUF)
- [Qwen3.6-35B-A3B-Claude-4.7-Opus-Reasoning-Distilled-APEX](https://huggingface.co/mudler/Qwen3.6-35B-A3B-Claude-4.7-Opus-Reasoning-Distilled-APEX-GGUF)
