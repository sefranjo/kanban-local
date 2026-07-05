# Kanban Board — Local SQLite

A local-only kanban board — To Do / Blocked / In Progress / Done with task hierarchies, comments, and rich-text editing. Every database lives in a single `.sqlite` file on your machine; no accounts, no cloud sync, no external services.

## Features

| Feature | Details |
|---|---|
| **Drag-and-drop** | Native HTML5 drag & drop between columns and reordering within a column (fractional sort order). |
| **Task hierarchy** | Create Epics (📁 with child count) or regular Tasks. Link any task as a parent/child of another; circular references are prevented by walking up the tree. |
| **Display name** | Optional per-task label that overrides its title on cards, while search still filters by canonical title + description. |
| **Rich text** | Bold / italic / underline / strikethrough / lists / code in task descriptions and comments (sanitized against `<script>` tags). |
| **Comments** | Editable, deletable per-task with inline toolbar. |
| **Label presets** | Predefined label names with customizable color, display alias, and card badge. Saved *per database* inside the `.sqlite` file itself — different databases have independent labels. |
| **Search** | Debounced (250 ms) across all cards' title + description (`Ctrl+K` / `Cmd+K`). Press Escape to restore the board. |
| **Theme** | Dark ↔ Light toggle with per-database preference (`Ctrl+T` / `Cmd+T`). |
| **Column management** | Right-click context menu: rename (native `prompt()`), reorder, delete (cascades children). |
| **Import & Export** | Download current board as `.sqlite`; import a `.sqlite` to replace the in-memory board. Auto-save kicks in once you've chosen where to persist. |

## Getting Started

### Prerequisites

Node.js — required for correct MIME type on `.wasm`. Python fallback (`python -m http.server`) serves static files but has **no API support**, so save/open/import/export won't work.

### Run

```bash
./start.sh [port]       # default 8089, background via nohup
node server.js          # foreground — always binds to port 8089 (ignores CLI args)
pkill -f "node server"  # stop
```

Server log → `/tmp/kanban-server.log`.

### Open your browser

Navigate to `http://localhost:8089` and choose **Create new database** or **Open existing .sqlite**. From the top bar you can export (download), import, manage labels, search, switch theme, and add tasks.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` / `Cmd+K` | Focus search box |
| `Ctrl+T` / `Cmd+T` | Toggle dark/light theme |
| `Escape` | Close modals, context menus, cancel comment editor; clears search if focused |
| `Enter` (task title) | Saves the task instead of inserting a newline |

## Gotchas

- No undo buffer — every edit commits immediately. Export `.sqlite` to preserve state before risky changes.
- Column renaming uses native `prompt()` dialog; no inline editing.
- Comments accept raw HTML from contenteditable divs; always pass through `sanitizeHtml()` (strips `<script>`, event handlers, `javascript:` URLs) before display.
