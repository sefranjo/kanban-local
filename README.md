# Kanban Board — Local SQLite [v1.6.2]

A local-only kanban board for organizing tasks across four default columns (To Do, Blocked, In Progress, Done). Every database lives in its own `.sqlite` file on your machine — no accounts, no cloud sync, no external services.

## Features at a glance

- **Task hierarchy** — Create Epics (📁 with child count) or regular Tasks. Link any task as parent/child of another; circular references are prevented automatically.
- **Drag-and-drop** — Reorder cards within a column or move them between columns using HTML5 native drag & drop (fractional sort order for smooth gaps).
- **Display names** — Optional per-task alias that overrides the title on cards while search still matches the canonical title and description.
- **Comments** — Rich-text WYSIWYG editor with inline toolbar (bold, italic, strikethrough, lists, code blocks) sanitized against `<script>` tags, event handlers, and `javascript:` URLs. Press `Esc` to cancel an open comment editor.
- **Label presets** — Color-coded badges on cards. Customize colors, display aliases per-database via the "Manage Labels" button in the top bar. Different databases have independent label sets.
- **Search & theme** — Search all cards' titles + descriptions (`Ctrl+K` / `Cmd+K`, debounced 250ms). Toggle dark/light mode; your choice persists in a cookie (you can also use OS preference when no cookie exists). Press `Esc` to restore the board after searching.
- **Column management** — Right-click context menu: rename, reorder, delete (children are soft-deleted along with it).
- **Import & Export** — Download the current board as a `.sqlite` file; import another to replace in-memory state. Auto-save kicks in once you've chosen where to persist.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` / `Cmd+K` | Focus search box |
| `Ctrl+T` / `Cmd+T` | Toggle dark/light theme |
| `Escape` | Close modals, context menus, cancel comment editor; clears search if focused |
| `Enter` (task title) | Saves the task instead of inserting a newline |

Cookie-based resume of the last opened database only works in **HTTP mode** (localhost). In HTTPS, the browser's File System Access API uses opaque handles that can't be serialized to cookies — you'll need to pick a file each time.

Returning users: if a previous database path is stored in your cookie, it opens automatically on load; otherwise you see the normal setup dialog. To open a different file, click **Open .sqlite** from the top bar.

## Getting started

1. Install **Node.js** — required for correct MIME type on `.wasm`. Python fallback (`python -m http.server`) serves static files but has *no API support*, so save/open features won't work.
2. Run `./start.sh [port]` (defaults to 8089) or `node server.js` (foreground). Server log → `/tmp/kanban-server.log`.
3. Open http://localhost:8089 in your browser and choose **Create new database** or **Open existing .sqlite**.
