# Sub-tasks Feature

## Goal
Add inline sub-task tracking within individual task cards, persisted in the `tasks` table's `subtasks` column as a JSON array.

## Design Decisions

### Storage
- **Column**: `subtasks TEXT DEFAULT '[]'` added to the `tasks` table.
- **Format**: JSON array of `{ id (string), title (string), done (boolean) }`.
- **Why JSON in a TEXT column**: Keeps schema changes minimal (single ALTER TABLE), avoids a new table, and matches how `card_labels` is stored (comma-separated string). Sub-tasks are always scoped to a single task, so no cross-task queries are needed.

### Sub-task ID generation
- Use `crypto.randomUUID()` (available in browser) or a simple `Date.now() + Math.random()` fallback. UUIDs prevent collisions when multiple tasks have sub-tasks.

### UI Placement — Card view
- **Progress indicator**: Below the card-labels, above the card-title.
- **Content**: A thin visual progress bar (filled based on completion %) with text `✓ X/Y` below it.
- **Click behavior**: Clicking the progress indicator opens the detail modal, which scrolls to the subtasks section.
- **Hidden**: Only shown when the task has at least one sub-task.

### UI Placement — Detail modal
- **Section position**: Below "Linked Tasks" section, above "Comments" section.
- **Content**:
  - A `<h3>Sub-tasks</h3>` header.
  - A `<div id="subtaskList">` for the list of sub-tasks.
  - An input row: `<input id="subtaskInput" placeholder="Add a sub-task...">` + `<button onclick="addSubtaskFromInput(taskId)">Add</button>`.
- **Sub-task row**: Each sub-task displays:
  - A checkbox (toggle completion).
  - A text label (title, with strikethrough when done).
  - A "✏️" edit button (click to edit title inline).
  - A "✕" delete button.
- **Editing**: Clicking the edit button replaces the title text with an inline `<input>` (editable). Pressing Enter or clicking a "Save" button confirms the edit. Pressing Escape cancels.

### Migration
- Add `ALTER TABLE tasks ADD COLUMN subtasks TEXT DEFAULT '[]'` in all DB initialization paths:
  1. `initNewDB()` (line 1148)
  2. Migration in `handleImport()` (line 1447)
  3. Migration in `openExistingDatabase()` (line 1531)
- Use `PRAGMA table_info(tasks)` check before ALTER to avoid duplicate column errors on re-run.

### Edge Cases
- **Empty sub-tasks**: Treated as no sub-tasks section (progress bar hidden on card, section still shows in modal with empty list).
- **Deleted task**: Sub-tasks are implicitly deleted (tied to parent task row).
- **Import**: Existing `.sqlite` files without the column will get it via migration.
- **Persistence**: Every add/delete/toggle/edit calls `autoSave()` after `db.run()`.
- **Concurrent edits**: No locking needed — single-user, in-memory DB.
- **Old databases**: `task.subtasks` may be `undefined`/`null`/`"[]"` — `parseSubtasks` handles all cases.
- **Empty title validation**: Reject empty/whitespace-only titles when adding or editing sub-tasks (show toast).
- **Input clearing**: After adding a sub-task via the input, clear the input field.
- **Progress indicator click**: The progress bar is inside the card, which may have other click handlers. Use `onclick="openDetail(...)"` directly on the `<div>`.

## Implementation Tasks (in order)

### 1. CSS additions (add to `<style>` block, ~25 lines)
- `.card-subtasks-progress` — container for progress bar + text.
- `.card-subtasks-bar` — thin progress bar background (light gray).
- `.card-subtasks-bar-fill` — filled portion (accent color, smooth transition).
- `.card-subtasks-text` — `✓ X/Y` text below the bar.
- `.subtask-input-row` — flex row for input + Add button.
- `.subtask-item` — flex row for each sub-task (gap between elements).
- `.subtask-item.done .subtask-title` — strikethrough text.
- `.subtask-edit-input` — inline edit input, same style as `.form-input`.

### 2. Schema changes (3 locations)
- **`initNewDB()`** line 1148: Add `subtasks TEXT DEFAULT '[]'` to the `CREATE TABLE tasks` statement. (No check needed — table is new.)
- **`handleImport()`** migration block (~line 1440): After the `PRAGMA table_info(tasks)` check, add:
  ```js
  if (!cols.find(c => c[1] === 'subtasks')) {
    db.run("ALTER TABLE tasks ADD COLUMN subtasks TEXT DEFAULT '[]'");
  }
  ```
- **`openExistingDatabase()`** migration block (~line 1510): Same migration as above.
- Guard with `PRAGMA table_info(tasks)` check before ALTER to avoid duplicate column errors.

### 3. Helper functions (add in `<script>` block, ~60 lines)
- `parseSubtasks(task)`: Parse `task.subtasks` JSON, defaulting to `[]`. Handle `undefined`/`null`/`"[]"` values (old databases).
- `saveSubtasks(taskId, subtasks)`: `db.run("UPDATE tasks SET subtasks = ? WHERE id = ?", [JSON.stringify(subtasks), taskId]); autoSave();`
- `addSubtask(taskId, title)`: Push new `{ id: crypto.randomUUID(), title, done: false }` and save. Validate title is non-empty.
- `toggleSubtask(taskId, subtaskId)`: Find sub-task by id, flip `done`, save.
- `deleteSubtask(taskId, subtaskId)`: Filter out and save.
- `editSubtask(taskId, subtaskId, newTitle)`: Update title and save. Validate title is non-empty.
- `getSubtaskProgress(task)`: Return `{ done, total }`. Return `{ done: 0, total: 0 }` if no sub-tasks.

### 4. Card view changes (`createCardElement` function, ~25 lines)
- After rendering labels (line 1911), check `getSubtaskProgress(task)`.
- If total > 0, insert progress HTML:
  ```html
  <div class="card-subtasks-progress" onclick="openDetail(${task.id})">
    <div class="card-subtasks-bar">
      <div class="card-subtasks-bar-fill" style="width:${(done/total)*100}%"></div>
    </div>
    <div class="card-subtasks-text">✓ ${done}/${total}</div>
  </div>
  ```
- The progress container is clickable to open the detail modal.

### 5. Detail modal changes (`renderLinkedTasks` function, ~100 lines)
- In `renderLinkedTasks(task)`, before the "Linked Tasks" `<h3>`, insert the subtasks section HTML:
  ```html
  <div id="subtasksSection" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-color);">
    <h3 style="font-size:14px;font-weight:700;margin-bottom:8px;">Sub-tasks</h3>
    <div id="subtaskList"></div>
    <div class="subtask-input-row">
      <input id="subtaskInput" class="form-input" placeholder="Add a sub-task..." style="flex:1;">
      <button class="btn btn-primary" onclick="addSubtaskFromInput(${task.id})" style="padding:6px 12px;font-size:12px;">Add</button>
    </div>
  </div>
  ```
- After inserting this HTML, call `renderSubtasks(task)` to populate the list (pass `task` object directly to avoid re-querying DB).
- Wire up Enter key on `#subtaskInput` to call `addSubtaskFromInput(task.id)`.
- `addSubtaskFromInput(taskId)`: Read value from `#subtaskInput`, trim, validate non-empty, call `addSubtask(taskId, title)`, clear input.
- `renderSubtasks(task)`:
  - Parse subtasks from `task.subtasks`.
  - For each sub-task, render a row:
    - Checkbox (checked if `done`, calls `toggleSubtask(taskId, id)`).
    - Title text (wrapped in `<span class="subtask-title">`, strikethrough via CSS class `done` when `done` is true).
    - Edit button (✏️, calls `startEditSubtask(taskId, id)`).
    - Delete button (✕, calls `deleteSubtask(taskId, id)`).
  - Inline edit mode: `startEditSubtask(taskId, subtaskId)` replaces the title `<span>` with an `<input class="subtask-edit-input">` containing the current title. On Enter, calls `editSubtask(taskId, subtaskId, newTitle)` and re-renders. On Escape or blur, cancels edit and re-renders.

### 6. Wire up scroll-to-subtasks
- In `openDetail()`, after `openModal('detailModal')` and `initSunEditor()`, check if `#subtasksSection` exists (it will only be created if `renderLinkedTasks` was called and the HTML was inserted).
- If it exists, scroll it into view: `document.getElementById('subtasksSection').scrollIntoView({ behavior: 'smooth', block: 'center' })`.

## Files Modified
- `index.html` — only file. All changes are inline (CSS in `<style>`, JS in `<script>`).

## Validation
- Create a task, add 3 sub-tasks, mark 2 as done — verify progress bar shows ~67% fill with `✓ 2/3`.
- Click progress bar on card — verify modal opens and scrolls to subtasks section.
- Edit a sub-task title inline — verify changes persist.
- Save and reload — verify sub-tasks persist.
- Import an old `.sqlite` without `subtasks` column — verify migration works.
- Delete a task with sub-tasks — verify cascade via soft-delete.
- Toggle sub-task completion — verify card progress updates immediately.
- Test with 0 sub-tasks — verify progress indicator is hidden.
- Test with 1/1 completed — verify progress bar is 100% filled.
