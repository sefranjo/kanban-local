# SunEditor WYSIWYG Integration

## Scope

Replace the hand-rolled `execCmd` WYSIWYG toolbar with SunEditor for:
- Task description editor (`#detailDesc`)
- New comment input (`#newCommentText`)

**Inline comment editing** (`.comment-edit-editor`) keeps the current `contenteditable-editor` approach — creating a SunEditor instance per comment being edited is too complex for the limited value.

## Decisions

### SunEditor source
Bundle `suneditor.min.js` + `suneditor.min.css` in `assets/`. The app already serves WASM from `assets/` and needs to work offline.

### Toolbar
Use SunEditor's built-in toolbar (configured via `buttonList`). Remove the custom `.editor-toolbar` divs and `populateToolbar()`.

### Editor instances
Create SunEditor instances in `openDetail()` and `toggleCommentEditor()`. Destroy them when the modal closes or the editor is dismissed.

### Sanitization
Keep `sanitizeHtml()` wrapping all editor output before DB writes. SunEditor's built-in sanitizer runs on input but we want our own rules.

### CSS
Override SunEditor's default styles to match the app's theme using CSS variables.

### Keyboard shortcuts
The global `keydown` handler at lines 2997-3013 checks `document.querySelector('.contenteditable-editor:focus')` to skip Enter-save and enable formatting shortcuts. With SunEditor, the editor wraps the target in a `.se-wrapper` div — the `.contenteditable-editor:focus` check won't match. Fix: check `descEditor.core` or `commentEditor.core` for focus (SunEditor instances expose a `core` property with the internal editor element).

### Paste handling
SunEditor has its own paste handler. Use it (default `pasteHandler: true`). The output is sanitized by `sanitizeHtml()` on save. This is simpler than the old approach which intercepted paste at the DOM level.

### Editor initialization idempotency
`openDetail()` can be called multiple times without the modal closing (user clicks another card while modal is open). `SE.create()` always creates a new instance — calling it twice on the same element will fail. Always call `destroySunEditor()` before `initSunEditor()` in `openDetail()`.

## Files to modify

### 1. `assets/` — add SunEditor files
- `assets/suneditor.min.js`
- `assets/suneditor.min.css`

### 2. `index.html` — add script/style imports

After `<script src="assets/sql-wasm.js"></script>` (line 783):
```html
<link rel="stylesheet" href="assets/suneditor.min.css">
<script src="assets/suneditor.min.js"></script>
```

### 3. `index.html` — remove old editor code

**Remove these sections:**
- `_execCmdSavedRange` global (line ~2198)
- `TOOLBAR_HTML` constant (line ~814)
- `populateToolbar()` function (line ~825)
- `execCmd()` function (line ~2198)
- `mousedown` selection-capture listener (line ~2299)
- `keydown` selection-capture listener (line ~2314)
- `paste` listener (line ~2328)

**Remove from HTML:**
- `<div class="editor-toolbar"></div>` above `#detailDesc` (line 735)
- `<div class="editor-toolbar"></div>` above `#newCommentText` (line 749)

**Remove from CSS (lines 317-379):**
- `.editor-toolbar` styles
- `.contenteditable-editor` styles (keep these for inline comment editing, but rename to avoid conflict — see below)

**Remove from DOMContentLoaded handler:**
- `populateToolbar()` call (line 2965)

### 4. `index.html` — add SunEditor initialization

**Add globals (after line 795):**
```js
let descEditor = null;
let commentEditor = null;
```

**Add initialization function (creates `descEditor` only — `commentEditor` is created lazily):**
```js
function initSunEditor() {
  descEditor = SE.create('#detailDesc', {
    buttonList: [
      ['bold', 'italic', 'underline', 'strike'],
      ['fontColor', 'hiliteColor'],
      ['ul', 'ol'],
      ['indent', 'outdent'],
      ['align', 'list'],
      ['code', 'codeblock'],
      ['link']
    ],
    placeholder: 'Write a description...',
    resizingPane: false,
    height: 'auto',
    style: { fontFamily: 'inherit', fontSize: 'inherit' }
  });
}
```

**Add destroy function (only destroys `descEditor`):**
```js
function destroySunEditor() {
  if (descEditor) { descEditor.destroy(); descEditor = null; }
  // commentEditor is destroyed separately in toggleCommentEditor() if needed
}
```

### 5. `index.html` — update `openDetail()` (line ~2417)

Replace:
```js
document.getElementById('detailDesc').innerHTML = _detailOrigDesc.replace(/\n/g, '<br>');
```
With:
```js
destroySunEditor();
initSunEditor();
// Bug fix: description from DB is already HTML (stored via sanitizeHtml(desc)).
// Only convert \n to <br> if the description is plain text (no HTML tags).
let descContent = _detailOrigDesc;
if (!/<[a-z][\s\S]*>/i.test(descContent)) {
  descContent = descContent.replace(/\n/g, '<br>');
}
descEditor.setValue(descContent);
```

Note: The original code had a bug — it always ran `replace(/\n/g, '<br>')` on the description, but the stored description is already HTML. This caused `<br><br>` elements when the description contained both `<br>` tags and literal newlines.

### 6. `index.html` — update `saveTaskDetails()` (line ~2433)

Replace:
```js
let desc = document.getElementById('detailDesc').innerHTML;
```
With:
```js
let desc = descEditor ? descEditor.getValue() : document.getElementById('detailDesc').innerHTML;
```

### 7. `index.html` — update `closeDetailModal()` (line ~2892)

Replace:
```js
const hasUnsaved = detailTitle.value.trim() !== _detailOrigTitle || detailDesc.textContent.trim() !== _detailOrigDesc;
```
With:
```js
const descValue = descEditor ? descEditor.getValue() : detailDesc.textContent;
const hasUnsaved = detailTitle.value.trim() !== _detailOrigTitle || descValue.trim() !== _detailOrigDesc;
```

Add `destroySunEditor()` at the end of the function (before `closeModal`). **Also add `commentEditorOpen = false;`** — if the user clicks the modal overlay (not the cancel button), `commentEditorOpen` stays `true` and the comment editor can't be reopened.

### 8. `index.html` — update comment functions

**`toggleCommentEditor()` (line ~2356):** After `commentEditorOpen = true;`, lazily create `commentEditor` if it doesn't exist, then call `commentEditor.setValue('');` and `commentEditor.focus();`.

```js
if (!commentEditor) {
  commentEditor = SE.create('#newCommentText', {
    buttonList: [
      ['bold', 'italic', 'underline', 'strike'],
      ['fontColor', 'hiliteColor'],
      ['ul', 'ol'],
      ['align'],
      ['code', 'codeblock']
    ],
    placeholder: 'Write a comment...',
    resizingPane: false,
    height: 'auto',
    style: { fontFamily: 'inherit', fontSize: 'inherit' }
  });
}
commentEditor.setValue('');
commentEditor.focus();
```

**`saveNewComment()` (line ~2363):** Replace `editor.innerHTML.trim()` with `commentEditor.getValue().trim()`. Add `destroySunEditor()` before `renderComments()` to clean up. **Also add `commentEditorOpen = false;`** — without this, the user can't add another comment after saving one (the `commentEditorOpen` guard in `toggleCommentEditor()` blocks it). **Also add `commentEditor = null;`** — the lazy creation check in `toggleCommentEditor()` relies on this being null.

**`cancelCommentEditor()` (line ~2379):** Replace `editor.innerHTML.trim()` with `commentEditor.getValue().trim()`. Add `destroySunEditor()` before closing the area. **Also add `commentEditorOpen = false;`** — the current code is missing this reset, which would prevent the user from reopening the comment editor after canceling. **Also add `commentEditor = null;`** — same lazy creation reason.

### 9. `index.html` — update global keyboard shortcut handler (lines 2997-3013)

Replace the `contenteditable-editor:focus` checks with SunEditor-aware checks. SunEditor instances have a `core` property with the internal editor element:

```js
// Enter in task title input saves the task (but not inside WYSIWYG editors).
if (e.key === 'Enter' && !e.shiftKey) {
  const inEditor = (descEditor?.core && descEditor.core.contains(document.activeElement)) ||
                   (commentEditor?.core && commentEditor.core.contains(document.activeElement));
  const titleInput = document.getElementById('taskTitleInput');
  if (!inEditor && document.activeElement === titleInput) {
    e.preventDefault();
    saveTask();
  }
}

// WYSIWYG formatting shortcuts (SunEditor handles these internally, no action needed).
```

SunEditor handles Ctrl+B/I/U/O/D internally, so the formatting shortcut block (lines 3005-3013) can be removed entirely.

### 10. `index.html` — update CSS

Replace the `.editor-toolbar` and `.contenteditable-editor` CSS blocks with SunEditor theme overrides. Keep `.contenteditable-editor` styles for inline comment editing (they only apply to elements with that class, and SunEditor wraps its target in `.se-wrapper` so there's no conflict).

```css
/* SunEditor theme overrides */
.se-wrapper { border-color: var(--border-color); }
.se-wrapper .se-toolbar { border-color: var(--border-color); background: var(--bg-column); }
.se-wrapper .se-btn { color: var(--text-secondary); }
.se-wrapper .se-btn:hover { background: rgba(0,0,0,0.08); color: var(--text-primary); }
.se-wrapper .se-btn-active { background: var(--accent); color: #fff; }
.se-wrapper .se-btn-layer { color: var(--text-primary); }
.se-wrapper .se-popup { border-color: var(--border-color); }
```

Additional overrides for the editable area (replacing old `.contenteditable-editor` styles):
```css
.se-wrapper .se-editable-wrap { overflow-y: auto; min-height: 120px; max-height: 300px; }
.se-wrapper .se-editable-wrap::before { content: attr(data-placeholder); color: var(--text-secondary); pointer-events: none; }
.se-wrapper .se-editable pre { background: var(--bg-column); padding: 8px 10px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 13px; margin: 4px 0; }
.se-wrapper .se-editable code { background: var(--bg-column); padding: 2px 5px; border-radius: 3px; font-family: 'Courier New', monospace; font-size: 13px; }
.se-wrapper .se-editable ul, .se-wrapper .se-editable ol { margin: 4px 0; padding-left: 24px; }
.se-wrapper .se-editable a { color: var(--accent); }
```

Additional overrides for other elements:
- `.se-wrapper .se-status-bar` — hide or style the status bar
- `.se-wrapper .se-resize-bar` — hide the resize handle (`resizingPane: false` should handle this)

## Data compatibility

SunEditor outputs HTML compatible with the current `execCmd` output:
- `<b>` for bold, `<i>` for italic, `<u>` for underline
- `<ul>/<ol>/<li>` for lists
- `<pre>` for code blocks

No data migration needed. `sanitizeHtml()` continues to strip `<script>`, event handlers, and `javascript:` URLs.

## API notes

- `SE.create(selector, config)` — creates a SunEditor instance, returns the instance object.
- `instance.destroy()` — destroys the instance and removes all event listeners.
- `instance.getValue()` — returns the editor content as HTML.
- `instance.setValue(html)` — sets the editor content.
- `instance.core` — internal editor element (used for focus detection in keyboard handler). Assumed to exist based on SunEditor internals; if not available in the chosen version, fall back to a global `isEditorFocused` flag set in `onFocus`/`onBlur` callbacks.
- `SE.getInstance(selector)` — **not a public API**, do not rely on it. Use the `descEditor` / `commentEditor` globals instead.

## Out of scope

- Migrating inline comment editing to SunEditor (too complex for limited value).
- Changing the `sanitizeHtml()` rules.
- Adding new SunEditor plugins (image upload, table, etc.).
- Changing the database schema or data format.

## Validation

1. Open a task detail modal — description editor shows SunEditor toolbar
2. Type formatted text (bold, italic, lists) — saves and persists
3. Open comment editor — SunEditor toolbar appears
4. Save comment — stored in DB correctly
5. Edit existing comment — inline `contenteditable-editor` still works
6. Close modal — editors are destroyed (no memory leaks)
7. Reopen same task — content loads correctly
8. Paste HTML from external source — `sanitizeHtml()` strips dangerous content
9. Dark/light theme — SunEditor UI adapts via CSS variables
10. Ctrl+B/I/U in editor — SunEditor handles formatting
11. Enter in title input — still triggers save when not in editor
12. Discard unsaved changes prompt — works correctly with SunEditor content
13. Click another card while modal is open — editor reinitializes cleanly (no duplicate instances)
14. Description with only newlines — no double-`<br>` bug
15. Description with mixed HTML and plain text — renders correctly
16. Empty description — editor shows placeholder
17. Very long description with lots of formatting — no performance issues