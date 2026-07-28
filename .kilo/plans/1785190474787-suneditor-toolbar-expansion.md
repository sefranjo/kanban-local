# SunEditor Toolbar Expansion

## Goal
Add the full set of requested buttons to the description editor and make the comment editor and inline comment editor match.

## Buttons to add to description editor

| Button | Purpose |
|---|---|
| `removeFormat` | Erase formatting |
| `font` | Font family selector |
| `fontSize` | Font size selector |
| `formatBlock` | Block formatting (H1–H6, P, etc.) |
| `textStyle` | Apply saved text styles |
| `lineHeight` | Line height control |
| `fontName` | Font name selector |
| `charMap` | Character map |
| `specialChar` | Special characters |
| `paragraphStyle` | Paragraph styles |
| `blockquote` | Blockquote |
| `table` | Insert table |
| `horizontalRule` | Horizontal rule |
| `image` | Insert image (URL or upload) |
| `code` | Inline code |
| `codeblock` | Code block |
| `quote` | Quote |
| `template` | Templates |
| `fullScreen` | Toggle fullscreen |
| `preview` | Preview rendered HTML |
| `undo` | Undo |
| `redo` | Redo |

## Implementation

### 1. Add `plugins` to config

The `image` and `table` buttons require explicit plugin enablement in SunEditor v2.47.11. Add a `plugins` option:

```js
plugins: ['image', 'table']
```

Other requested buttons (`code`, `codeblock`, `link`) are bundled by default and work without explicit plugin enablement.

### 2. New description editor buttonList

Replace the current 5-group buttonList with a single flat array of 22 buttons:

```js
buttonList: [
  ['bold', 'italic', 'underline', 'strike'],
  ['fontColor', 'hiliteColor'],
  ['removeFormat'],
  ['font', 'fontSize', 'fontName', 'textStyle', 'lineHeight'],
  ['formatBlock'],
  ['paragraphStyle', 'blockquote'],
  ['list', 'indent', 'outdent'],
  ['align'],
  ['table', 'horizontalRule'],
  ['link', 'image'],
  ['code', 'codeblock'],
  ['quote'],
  ['charMap', 'specialChar'],
  ['template'],
  ['fullScreen', 'preview'],
  ['undo', 'redo']
]
```

### 3. Create shared `EDITOR_CONFIG`

Define a single config object at module scope and reuse it for all three editor instances:

```js
const EDITOR_CONFIG = {
  buttonList: [
    ['bold', 'italic', 'underline', 'strike'],
    ['fontColor', 'hiliteColor'],
    ['removeFormat'],
    ['font', 'fontSize', 'fontName', 'textStyle', 'lineHeight'],
    ['formatBlock'],
    ['paragraphStyle', 'blockquote'],
    ['list', 'indent', 'outdent'],
    ['align'],
    ['table', 'horizontalRule'],
    ['link', 'image'],
    ['code', 'codeblock'],
    ['quote'],
    ['charMap', 'specialChar'],
    ['template'],
    ['fullScreen', 'preview'],
    ['undo', 'redo']
  ],
  plugins: ['image', 'table'],
  placeholder: '',
  resizingPane: false,
  height: 'auto',
  style: { fontFamily: 'inherit', fontSize: 'inherit' }
};
```

Then update the three `SUNEDITOR.create()` calls:

- **`initSunEditor()`** (line ~772) — description editor: `EDITOR_CONFIG` + `placeholder: 'Write a description...'`
- **`toggleCommentEditor()`** (line ~2188) — new comment input: `EDITOR_CONFIG` + `placeholder: 'Write a comment...'`
- **`loadComments()`** (line ~2474) — inline comment editor: `EDITOR_CONFIG` + `placeholder: 'Write a comment...'`
- **`loadCommentsWithEditFlag()`** (line ~2566) — inline comment editor: `EDITOR_CONFIG` + `placeholder: 'Write a comment...'`

### 4. Update `assets/suneditor.min.dark.css`

Add dark theme overrides for newly introduced widget classes. Key selectors to add:

- `.se-btn-layer` — already present (OK)
- `.se-colorpicker` — color picker popup (already present)
- `.se-popup` — generic popup (already present)
- `.se-btn-layer .se-btn` — toolbar button states in popups
- `.se-resize-bar` — already present (hidden)
- `.se-status-bar` — already present (hidden)
- `.se-tooltip` — tooltip text
- `.se-image-popup` — image insert dialog
- `.se-table-popup` — table insert dialog
- `.se-colorpicker` — color picker (already present)
- `.se-dropdown` — dropdown menus
- `.se-link` — link dialog
- `.se-modal` — modal dialogs
- `.se-modal-backdrop` — modal backdrop
- `.se-colorpicker-box` — color picker box
- `.se-colorpicker-label` — color picker label
- `.se-colorpicker-input` — color picker input
- `.se-colorpicker-swatch` — color picker swatch
- `.se-colorpicker-swatch-active` — active color swatch
- `.se-colorpicker-swatch-hover` — hovered color swatch
- `.se-colorpicker-swatch-border` — color swatch border
- `.se-colorpicker-swatch-border-active` — active color swatch border
- `.se-colorpicker-swatch-border-hover` — hovered color swatch border
- `.se-colorpicker-swatch-border-active-hover` — active hovered color swatch border
- `.se-colorpicker-swatch-border-active-hover-active` — active hovered active color swatch border

### 5. Update CSS in `index.html`

Add `.sun-editor-editable` overrides for newly introduced content types (tables, blockquotes, code blocks) if needed.

## Notes

- `fontName` and `font` may be the same button in SunEditor v2.47.11 — test and remove if duplicate.
- `template` may not exist in v2.47.11 — test and remove if not found.
- `code` and `codeblock` are bundled by default in the minified build.
- `link` is also bundled by default.
- `image` and `table` require explicit plugin enablement.
- Dark theme CSS for new widgets can be added after testing if anything looks wrong.
- The `resize` bar and `status bar` should remain hidden (already handled by existing CSS).
