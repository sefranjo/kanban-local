# WYSIWYG Editor Improvements Plan

## Current State

WYSIWYG editor in `index.html` (lines ~819-2820) with:
- Toolbar with inline onclick handlers
- `execCmd()` function (121 lines) with browser workarounds
- Global `_execCmdSavedRange` for cursor management
- `sanitizeHtml()` for HTML sanitization
- Comment editor integration

## Issues Identified

## Summary

### Current State
WYSIWYG editor in `index.html` with:
- Toolbar defined as raw HTML strings (`TOOLBAR_HTML`, lines 819-828)
- `execCmd()` function (121 lines) with embedded browser workarounds
- Global `_execCmdSavedRange` variable for cursor management
- `sanitizeHtml()` for HTML sanitization (security vulnerability)
- Two separate comment save functions with inconsistent behavior

### Impact
- **Security**: Comments may contain unsanitized HTML (critical)
- **Maintainability**: Code duplication and embedded workarounds make changes difficult
- **Performance**: Selection change handler runs without throttling
- **Bug Potential**: Range management has race conditions and stale state

### Goals
1. Fix HTML syntax error in toolbar
2. Improve code organization and maintainability
3. Enhance security with better sanitization
4. Add proper range state management
5. Improve performance with debouncing

### Success Criteria
- All toolbar buttons work consistently across Chrome/Firefox/Edge
- Range is preserved correctly after operations
- Sanitization removes all dangerous HTML
- Selection change updates are debounced
- Comment save logic is unified with consistent behavior

## Issues Identified

### Bugs (MEDIUM)
1. Line 823: `<s>SFTP</button>` - malformed HTML closing tag
2. Range restoration (lines 2304-2321): race condition between saved and browser-positioned ranges
3. Firefox list workaround uses `last-of-type` which may target wrong list

### Maintainability (LOW-MEDIUM)
1. `execCmd()` is 121 lines with embedded workarounds
2. Global `_execCmdSavedRange` has no ownership
3. Toolbar defined as raw HTML strings, not data-driven

### Performance (MEDIUM)
1. Selection change listener (lines 2381-2394): no debounce on high-frequency events

## Improvements

### 1. Security Enhancement

**Problem:** Current `sanitizeHtml()` (lines 1969-179) only uses regex to strip `<script>` tags and remove event handlers, but it doesn't handle:
- SVG elements with `onload` handlers (`<svg onload=alert(1)>`)
- MathML elements with JavaScript
- All event handler attributes comprehensively (only handles `onX` via regex)
- `javascript:` URLs in attributes other than `href`/`src`/`action`

**Action:** Replace with DOMParser-based sanitization that parses HTML into a DOM tree and removes dangerous elements/attributes safely.

**Current Implementation (lines 1969-179):**
```javascript
function sanitizeHtml(html) {
  if (!html) return '';
  // Remove all <script> elements and their content (handles unclosed tags via the standalone pass).
  html = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, '');
  html = html.replace(/<script\b[^>]*/gi, '');
  // Strip event handler attributes: onclick, onerror, onload, onmouseover, etc.
  html = html.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Neutralize javascript: URLs in href / src / action and any other attribute.
  html = html.replace(/(href|src|action)\s*=\s*["']?\s*javascript:/gi, '$1="invalid"');
  return html;
}
```

**Proposed Implementation:**
```javascript
function sanitizeHtml(html) {
  if (!html) return '';
  
  // Create a temporary DOM for parsing
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Remove dangerous elements
  doc.querySelectorAll('script,svg,math').forEach(el => el.remove());
  
  // Sanitize all attributes on all elements
  doc.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      const name = attr.name.toLowerCase();
      // Remove event handlers (onXyz)
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
      } else if (name === 'href' || name === 'src' || name === 'action') {
        // Neutralize javascript: URLs
        const value = attr.value.trim();
        if (value.toLowerCase().startsWith('javascript:')) {
          el.removeAttribute(attr.name);
        }
      }
    });
  });
  
  // Return sanitized HTML
  return doc.body.innerHTML;
}
```

**Benefits:**
- DOMParser is more robust than regex for HTML parsing
- Removes all SVG/MathML elements that could contain event handlers
- Processes all attributes systematically
- Works with nested HTML structures correctly

**Risks:**
- May change behavior for previously accepted HTML (e.g., comments with `<svg>` or `<math>`)
- Performance impact (DOMParser is slower than regex) - acceptable for comment content which is not huge

**Mitigation:** Test existing comments to ensure no content is unexpectedly stripped. Consider using DOMPurify library for production if bundle size is acceptable.

### 2. Fix Toolbar HTML Syntax Error

**Problem:** Line 823 has malformed HTML - the `<s>` tag is not closed properly. The closing `</s>` is missing.

**Current Implementation (line 823):**
```javascript
'<button type="button" onclick="execCmd(\'strikeThrough\')" title="Strikethrough"><s>SFTP</button>',
```

**Proposed Fix:**
```javascript
'<button type="button" onclick="execCmd(\'strikeThrough\')" title="Strikethrough"><s>SFTP</s></button>',
```

**Why This Matters:**
- Malformed HTML can cause unexpected rendering issues in some browsers
- May affect accessibility (screen readers rely on proper HTML structure)
- Violates HTML standards and makes code harder to maintain

**Impact:** Minimal - this is a simple syntax fix that improves HTML validity.

### 3. Refactor execCmd() for Maintainability

**Problem:** `execCmd()` is 121 lines (lines 2208-2328) with embedded workarounds for:
- `formatBlock('pre')` cursor positioning (lines 2246-263)
- Firefox list insertion cursor positioning (lines 2265-299)
- Range restoration before/after execCommand (lines 2226-242, 2304-2321)

The function has multiple responsibilities and is hard to test or modify.

**Current Implementation Structure:**
```javascript
function execCmd(command, value) {
  // 1. Find active editor (lines 2210-224)
  // 2. Save range (lines 2226-242)
  // 3. Restore saved range (lines 2236-242)
  // 4. Special handling for formatBlock('pre') (lines 2246-263)
  // 5. Firefox workaround for lists (lines 2265-299)
  // 6. Normal execCommand (line 2301)
  // 7. Restore/adjust range after (lines 2304-2321)
  // 8. Focus editor (line 2324)
  _execCmdSavedRange = null;
}
```

**Proposed Refactoring:**

**Step 1:** Extract helper functions for editor detection
```javascript
function findActiveEditor() {
  // Find whichever contenteditable currently has focus (description or comment editor)
  let target = null;
  document.querySelectorAll('.contenteditable-editor').forEach(el => {
    if (document.activeElement === el || el.contains(document.activeElement)) {
      target = el;
    }
  });
  
  // If we don't have a focused editor but captured one via mousedown, use that
  if (!target && _execCmdSavedRange) {
    document.querySelectorAll('.contenteditable-editor').forEach(el => {
      if (_execCmdSavedRange.startContainer === el || el.contains(_execCmdSavedRange.startContainer)) {
        target = el;
      }
    });
  }
  
  return target;
}
```

**Step 2:** Extract range management
```javascript
function saveSelection() {
  try {
    const sel = window.getSelection();
    const target = findActiveEditor();
    if (target && sel.rangeCount > 0 && target.contains(sel.anchorNode)) {
      return sel.getRangeAt(0);
    }
  } catch(_) {}
  return null;
}

function restoreSelection(savedRange) {
  try {
    const sel = window.getSelection();
    if (savedRange && savedRange.startContainer) {
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
  } catch(_) {}
}
```

**Step 3:** Extract browser-specific workarounds
```javascript
function insertCodeBlock(target) {
  // Workaround for formatBlock('pre'): manual insertHTML + cursor inside <code>
  document.execCommand('insertHTML', false, '<pre><code><br></code></pre>');
  try {
    const pre = target.querySelector('pre:last-of-type');
    if (pre) {
      const code = pre.querySelector('code') || pre;
      const range = document.createRange();
      range.setStart(code, 0);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      target.focus({ preventScroll: true });
    }
  } catch(_) {}
}

function insertListFirefox(target, command) {
  // Firefox workaround for insertUnorderedList / insertOrderedList
  const listCmd = command === 'insertUnorderedList' ? '<ul><li></li></ul>' : '<ol><li></li></ol>';
  document.execCommand('insertHTML', false, listCmd);
  
  try {
    const list = target.querySelector('ul:last-of-type, ol:last-of-type');
    if (list) {
      const li = list.querySelectorAll('li').pop();
      if (li) {
        const range = document.createRange();
        range.setStart(li, 0);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        target.focus({ preventScroll: true });
      }
    }
  } catch(_) {}
}
```

**Step 4:** Simplified main execCmd function
```javascript
function execCmd(command, value) {
  const target = findActiveEditor();
  if (!target) return;
  
  const savedRange = saveSelection();
  
  try {
    // Handle special cases first
    if (command === 'formatBlock' && value === 'pre') {
      insertCodeBlock(target);
      return;
    }
    
    // Firefox list workaround
    if (isFirefox() && ['insertUnorderedList', 'insertOrderedList'].includes(command)) {
      insertListFirefox(target, command);
      return;
    }
    
    // Normal execCommand
    document.execCommand(command, false, value);
    
  } catch (e) {
    console.error('[execCmd] Error:', e.message);
  } finally {
    restoreSelection(savedRange);
    if (target) target.focus({ preventScroll: true });
  }
}
```

**Benefits:**
- Each function has a single responsibility
- Easier to test in isolation
- Easier to maintain and modify
- Better code organization

**Risks:**
- May change behavior if edge cases were previously handled implicitly
- Need to test all editor states (description editor, comment editor, no focus)

**Mitigation:** Add unit tests for each extracted function. Test with various editor states and selection positions.

### 4. Implement RangeManager Class

**Problem:** Global variable `_execCmdSavedRange` (line 2226) has no ownership and is used across multiple event handlers. This creates:
- State management confusion (when is it set? when should it be cleared?)
- Potential race conditions between mouse events, keyboard events, and execCmd calls
- Difficult to track bugs when the range goes stale

**Current Implementation:**
```javascript
// Line 2226 - global variable
_execCmdSavedRange = null;

// Lines 2331-2343 - mouse event listener
document.addEventListener('mousedown', function(e) {
  const btn = e.target.closest('.editor-toolbar button');
  if (!btn) return;
  try {
    const sel = window.getSelection();
    for (const el of document.querySelectorAll('.contenteditable-editor')) {
      if (el.contains(sel.anchorNode)) {
        _execCmdSavedRange = sel.getRangeAt(0);
        break;
      }
    }
  } catch(_) {}
});

// Lines 2346-2358 - keyboard event listener
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'b' || e.key === 'i' || e.key === 'u' || e.key === 'o' || e.key === 'd')) {
    try {
      const sel = window.getSelection();
      for (const el of document.querySelectorAll('.contenteditable-editor')) {
        if (el.contains(sel.anchorNode)) {
          _execCmdSavedRange = sel.getRangeAt(0);
          break;
        }
      }
    } catch(_) {}
  }
});

// Lines 2226-242 - range capture in execCmd
try {
  const sel = window.getSelection();
  if (!(_execCmdSavedRange && target && target.contains(_execCmdSavedRange.startContainer))
      && target && target.contains(sel.anchorNode) && sel.rangeCount > 0) {
    _execCmdSavedRange = sel.getRangeAt(0);
  }
} catch(_) {}

// Lines 2236-242 - range restoration in execCmd
try {
  if (_execCmdSavedRange && target && target.contains(_execCmdSavedRange.startContainer)) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(_execCmdSavedRange);
  }
} catch(_) {}

// Line 2327 - range cleared after execCmd
_execCmdSavedRange = null;
```

**Proposed RangeManager Class:**
```javascript
class RangeManager {
  constructor() {
    this.savedRange = null;
    this.lastTarget = null;
  }
  
  /**
   * Save the current selection range and target editor.
   * Should be called before any editor interaction (toolbar click, shortcut).
   */
  save() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    
    this.savedRange = sel.getRangeAt(0);
    this.lastTarget = document.activeElement;
    
    // Verify the range is in a contenteditable editor
    if (!this.lastTarget.classList.contains('contenteditable-editor')) {
      // Check if the range is contained within an editor
      const editors = document.querySelectorAll('.contenteditable-editor');
      let foundEditor = null;
      for (const editor of editors) {
        if (editor.contains(this.savedRange.startContainer)) {
          foundEditor = editor;
          break;
        }
      }
      if (foundEditor) {
        this.lastTarget = foundEditor;
      }
    }
  }
  
  /**
   * Restore the saved selection range and focus the target editor.
   * Should be called after editor operations complete.
   */
  restore() {
    if (this.savedRange && this.lastTarget) {
      try {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(this.savedRange);
        this.lastTarget.focus({ preventScroll: true });
      } catch (_) {
        // Range may be stale if DOM changed
        console.debug('[RangeManager] Restore failed: range stale or DOM changed');
      }
    }
  }
  
  /**
   * Clear saved range and target.
   * Should be called after operations complete successfully.
   */
  clear() {
    this.savedRange = null;
    this.lastTarget = null;
  }
  
  /**
   * Check if a saved range exists and is valid.
   */
  hasSavedRange() {
    return !!(this.savedRange && this.lastTarget);
  }
}

// Global instance
const rangeManager = new RangeManager();
```

**Usage in Event Listeners:**
```javascript
// Before toolbar button click (mousedown)
document.addEventListener('mousedown', function(e) {
  const btn = e.target.closest('.editor-toolbar button');
  if (!btn) return;
  rangeManager.save();
});

// Before keyboard shortcut (keydown)
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && ['b','i','u','o','d'].includes(e.key)) {
    rangeManager.save();
  }
});

// In execCmd (before and after)
function execCmd(command, value) {
  const target = findActiveEditor();
  if (!target) return;
  
  // Range already saved by event listener
  // ... rest of function
}
```

**Benefits:**
- Encapsulates range state management
- Clear API (save, restore, clear, hasSavedRange)
- Easier to debug (single source of truth)
- Better error handling with try/catch in methods

**Risks:**
- May behave differently if DOM changes between save() and restore()
- Need to handle edge cases (stale ranges, removed editors)

**Mitigation:** Test with rapid clicks and keyboard shortcuts. Test with dynamic DOM changes (comments added/deleted).

### 5. Debounce Selection Change Handler

**Problem:** Selection change listener (lines 2381-2394) fires on every selection change, which can happen frequently during typing, cursor movement, or mouse drag. The current implementation:
- Runs DOM queries on every selection change
- No throttling or debouncing
- May cause performance issues with many toolbar buttons

**Current Implementation (lines 2380-2394):**
```javascript
const TOGGLE_FORMATTING_COMMANDS = ['bold', 'italic', 'underline', 'strikeThrough'];
document.addEventListener('selectionchange', function() {
  const inEditor = document.querySelector('.contenteditable-editor:focus') ||
    document.querySelector('.contenteditable-editor *:focus');
  if (!inEditor) {
    document.querySelectorAll('.editor-toolbar button').forEach(b => b.classList.remove('active'));
    return;
  }
  document.querySelectorAll('.editor-toolbar button').forEach(function(btn) {
    const match = btn.getAttribute('onclick')?.match(/execCmd\('(\w+)'/);
    if (match && TOGGLE_FORMATTING_COMMANDS.includes(match[1])) {
      try { btn.classList.toggle('active', document.queryCommandState(match[1])); } catch(_) {}
    }
  });
});
```

**Proposed Refactored Implementation:**

**Step 1:** Extract toolbar button active state update logic
```javascript
function updateToolbarActiveStates() {
  const editor = document.querySelector('.contenteditable-editor:focus') ||
    document.querySelector('.contenteditable-editor *:focus');
  
  if (!editor) {
    document.querySelectorAll('.editor-toolbar button').forEach(b => b.classList.remove('active'));
    return;
  }
  
  document.querySelectorAll('.editor-toolbar button').forEach(function(btn) {
    const match = btn.getAttribute('onclick')?.match(/execCmd\('(\w+)'/);
    if (match && TOGGLE_FORMATTING_COMMANDS.includes(match[1])) {
      try {
        btn.classList.toggle('active', document.queryCommandState(match[1]));
      } catch(_) {}
    }
  });
}
```

**Step 2:** Add debounce helper
```javascript
/**
 * Create a debounced version of a function.
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} - Debounced function
 */
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
```

**Step 3:** Create debounced selection change handler
```javascript
// Debounce delay in milliseconds
const SELECTION_CHANGE_DEBOUNCE_MS = 50;

const selectionChangeHandler = debounce(updateToolbarActiveStates, SELECTION_CHANGE_DEBOUNCE_MS);

document.addEventListener('selectionchange', selectionChangeHandler);
```

**Benefits:**
- Reduces DOM query frequency during rapid selection changes
- Improves performance during typing/cursor movement
- 50ms delay is imperceptible to users but reduces CPU usage

**Risks:**
- Toolbar button active state may not update immediately during rapid selection changes
- Could be confusing if user quickly switches between bold/italic

**Mitigation:** 
- Test with rapid keyboard shortcuts (Ctrl+B, Ctrl+I, etc.)
- Consider reducing delay to 25ms if immediate feedback is important
- Alternative: Use `throttle` instead of `debounce` if you want updates at regular intervals

**Alternative Approach:** If immediate feedback is required, use `requestAnimationFrame` instead of debounce:

```javascript
let pendingUpdate = false;

function updateToolbarActiveStates() {
  // ... existing logic
}

function scheduleToolbarUpdate() {
  if (!pendingUpdate) {
    pendingUpdate = true;
    requestAnimationFrame(() => {
      pendingUpdate = false;
      updateToolbarActiveStates();
    });
  }
}

document.addEventListener('selectionchange', scheduleToolbarUpdate);
```

This provides immediate updates but batches multiple changes within a single frame.

### 6. Unify Comment Save Logic

**Problem:** Two separate functions `saveNewComment()` (lines 2411-225) and `saveComment()` (lines 2763-2774) have similar logic but different code paths. This creates:
- Code duplication
- Inconsistent behavior between new and edited comments
- Harder to maintain (fixing a bug requires finding both functions)

**Current Implementations:**

**saveNewComment() (lines 2411-225):**
```javascript
function saveNewComment() {
  const editor = document.getElementById('newCommentText');
  const html = editor.innerHTML.trim();
  if (!html || html === '<br>') { showToast('Nothing to save.'); return; }
  
  const taskId = parseInt(document.getElementById('detailTaskId').value);
  db.run("INSERT INTO comments (task_id, body) VALUES (?, ?)", [taskId, html]);
  autoSave();
  commentEditorOpen = false;
  document.getElementById('commentInputArea').style.display = 'none';
  document.getElementById('addCommentBtn').style.display = '';
  editor.innerHTML = '';
  renderComments(taskId);
  showToast('Comment added!');
}
```

**saveComment() (lines 2763-2774):**
```javascript
function saveComment(commentId) {
  // Find the specific editor for this comment (not the "new comment" one).
  const editor = document.querySelector('.comment-edit-editor[data-comment-id="' + commentId + '"]') || document.getElementById('editCommentText');
  const html = editor.innerHTML.trim();
  if (!html || html === '<br>') return;
  
  db.run("UPDATE comments SET body = ? WHERE id = ?", [sanitizeHtml(html), parseInt(commentId)]);
  autoSave();
  
  const taskId = parseInt(document.getElementById('detailTaskId').value);
  renderComments(taskId);
}
```

**Issues with Current Implementation:**

1. **Inconsistent sanitization:** `saveNewComment()` does NOT call `sanitizeHtml()` on the content (line 2417), while `saveComment()` does (line 2769). This is a security vulnerability - new comments could contain malicious HTML that isn't sanitized.

2. **Incomplete cleanup:** `saveComment()` doesn't close the editor UI or show a toast notification.

3. **Missing error handling:** Neither function has try/catch blocks.

4. **Different validation:** `saveNewComment()` shows a toast on empty content; `saveComment()` silently returns.

**Proposed Unified saveComment() Function:**

```javascript
/**
 * Save a comment (new or edited).
 * @param {number} commentId - Comment ID to edit, or null for new comment
 */
function saveComment(commentId) {
  try {
    // Find the appropriate editor
    const editor = commentId
      ? document.querySelector('.comment-edit-editor[data-comment-id="' + commentId + '"]')
      : document.getElementById('newCommentText');
    
    if (!editor) {
      console.error('[saveComment] Editor not found');
      return;
    }
    
    const html = editor.innerHTML.trim();
    
    // Validation
    if (!html || html === '<br>') {
      showToast(commentId ? 'Comment is empty.' : 'Nothing to save.');
      return;
    }
    
    const taskId = parseInt(document.getElementById('detailTaskId').value);
    const sanitizedHtml = sanitizeHtml(html); // Always sanitize!
    
    // Database operation
    if (commentId) {
      // Edit existing comment
      db.run("UPDATE comments SET body = ? WHERE id = ?", [sanitizedHtml, parseInt(commentId)]);
      autoSave();
      renderComments(taskId);
      showToast('Comment updated!');
    } else {
      // Insert new comment
      db.run("INSERT INTO comments (task_id, body) VALUES (?, ?)", [taskId, sanitizedHtml]);
      autoSave();
      
      // Close editor UI
      commentEditorOpen = false;
      document.getElementById('commentInputArea').style.display = 'none';
      document.getElementById('addCommentBtn').style.display = '';
      
      // Clear editor for next use
      const newCommentEditor = document.getElementById('newCommentText');
      if (newCommentEditor) {
        newCommentEditor.innerHTML = '';
      }
      
      renderComments(taskId);
      showToast('Comment added!');
    }
  } catch (err) {
    console.error('[saveComment] Error:', err);
    showToast('Failed to save comment.');
  }
}
```

**Benefits:**
- Single source of truth for comment saving logic
- Consistent sanitization (fixes security vulnerability)
- Consistent UI behavior (close editor, show toast)
- Better error handling
- Easier to maintain

**Risks:**
- `commentEditorOpen` variable may not be defined in scope if called from other functions
- Some callers may expect different behavior (e.g., `saveComment()` doesn't close editor)

**Mitigation:**
- Ensure `commentEditorOpen` is accessible or remove dependency
- Update all callers to use the unified function
- Test existing workflows to ensure no unexpected behavior changes

**Callers to Update:**

1. **saveNewComment()** - Replace call sites with `saveComment(null)`
2. **Comment edit button (line 2666)** - Already calls `saveComment(c.id)` - no change needed
3. **Comment edit button (line 2746)** - Already calls `saveComment(c.id)` - no change needed

**Test Cases:**
1. New comment with valid HTML
2. New comment with malicious HTML (should be sanitized)
3. Edited comment with valid HTML
4. Empty comment (should show appropriate toast)
5. Comment with script tags (should be stripped)

### 7. Data-Driven Toolbar

**Problem:** Toolbar is defined as raw HTML strings in `TOOLBAR_HTML` constant (lines 819-828). This creates:
- Hard to maintain (adding buttons requires manual string manipulation)
- No centralized button configuration
- Vulnerable to HTML injection if configuration could be user-controlled

**Current Implementation (lines 819-828):**
```javascript
var TOOLBAR_HTML = [
  '<button type="button" onclick="execCmd(\'bold\')" title="Bold (Ctrl+B)"><b>B</b></button>',
  '<button type="button" onclick="execCmd(\'italic\')" title="Italic (Ctrl+I)"><i>I</i></button>',
  '<button type="button" onclick="execCmd(\'underline\')" title="Underline (Ctrl+U)"><u>U</u></button>',
  '<button type="button" onclick="execCmd(\'strikeThrough\')" title="Strikethrough"><s>SFTP</button>',
  '<button type="button" onclick="execCmd(\'insertUnorderedList\')" title="Bullet list (Ctrl+O)">• List</button>',
  '<button type="button" onclick="execCmd(\'insertOrderedList\')" title="Numbered list (Ctrl+D)">1. List</button>',
  '<button type="button" onclick="execCmd(\'formatBlock\', \'pre\')" title="Code block">&lt;/&gt;</button>',
  '<button type="button" onclick="insertInlineCode()" title="Inline code">&lt;/&gt;</button>'
].join('');
```

**Proposed Data-Driven Configuration:**

```javascript
// Button configuration - data structure instead of HTML strings
const TOOLBAR_CONFIG = [
  {
    id: 'bold',
    command: 'bold',
    label: '<b>B</b>',
    title: 'Bold (Ctrl+B)',
    shortcut: 'Ctrl+B'
  },
  {
    id: 'italic',
    command: 'italic',
    label: '<i>I</i>',
    title: 'Italic (Ctrl+I)',
    shortcut: 'Ctrl+I'
  },
  {
    id: 'underline',
    command: 'underline',
    label: '<u>U</u>',
    title: 'Underline (Ctrl+U)',
    shortcut: 'Ctrl+U'
  },
  {
    id: 'strikeThrough',
    command: 'strikeThrough',
    label: '<s>SFTP</button>',
    title: 'Strikethrough'
  },
  {
    id: 'unorderedList',
    command: 'insertUnorderedList',
    label: '• List',
    title: 'Bullet list (Ctrl+O)',
    shortcut: 'Ctrl+O'
  },
  {
    id: 'orderedList',
    command: 'insertOrderedList',
    label: '1. List',
    title: 'Numbered list (Ctrl+D)',
    shortcut: 'Ctrl+D'
  },
  {
    id: 'codeBlock',
    command: 'formatBlock',
    commandValue: 'pre',
    label: '</>',
    title: 'Code block'
  },
  {
    id: 'inlineCode',
    command: 'insertInlineCode',
    label: '</>',
    title: 'Inline code'
  }
];

/**
 * Populate all editor toolbars with button HTML.
 */
function populateToolbar() {
  const toolbarButtonsHtml = TOOLBAR_CONFIG.map(btn => {
    // Build execCmd call arguments
    let cmdArgs = `'${btn.command}'`;
    if (btn.commandValue) {
      cmdArgs += `, '${btn.commandValue}'`;
    }
    
    // Build button HTML
    const buttonHtml = `<button type="button" onclick="execCmd(${cmdArgs})" title="${escapeHtml(btn.title)}">${btn.label}</button>`;
    
    // Add data attribute for testing/extension
    return `${buttonHtml}`;
  }).join('');
  
  document.querySelectorAll('.editor-toolbar').forEach(tb => {
    if (tb.innerHTML === '') {
      tb.innerHTML = toolbarButtonsHtml;
    }
  });
}
```

**Benefits:**

1. **Maintainability:** Adding a new button is a simple array addition
2. **Configuration:** Centralized button configuration
3. **Extensibility:** Can easily add properties like `shortcut`, `icon`, `tooltip`, `id`
4. **Testing:** Easier to test individual button definitions
5. **Accessibility:** Can add ARIA attributes per button

**Example Extension (Accessibility):**
```javascript
const TOOLBAR_CONFIG = [
  {
    id: 'bold',
    command: 'bold',
    label: '<b>B</b>',
    title: 'Bold (Ctrl+B)',
    ariaLabel: 'Bold text',
    ariaPressed: false,
    shortcut: 'Ctrl+B'
  },
  // ... more buttons
];

function populateToolbar() {
  // ... existing code
  const buttonHtml = `<button type="button" 
    onclick="execCmd(${cmdArgs})" 
    title="${escapeHtml(btn.title)}"
    aria-label="${escapeHtml(btn.ariaLabel || btn.title)}"
    aria-pressed="${btn.ariaPressed || 'false'}">${btn.label}</button>`;
}
```

**Alternative: Component-Based Toolbar**

For more complex scenarios:

```javascript
class ToolbarButton {
  constructor(config) {
    this.config = config;
  }
  
  toHtml() {
    let cmdArgs = `'${this.config.command}'`;
    if (this.config.commandValue) {
      cmdArgs += `, '${this.config.commandValue}'`;
    }
    return `<button type="button" onclick="execCmd(${cmdArgs})" title="${escapeHtml(this.config.title)}">${this.config.label}</button>`;
  }
}

const TOOLBAR_CONFIG = [
  new ToolbarButton({ command: 'bold', label: '<b>B</b>', title: 'Bold (Ctrl+B)' }),
  new ToolbarButton({ command: 'italic', label: '<i>I</i>', title: 'Italic (Ctrl+I)' }),
  // ...
];

function populateToolbar() {
  const buttonsHtml = TOOLBAR_CONFIG.map(btn => btn.toHtml()).join('');
  document.querySelectorAll('.editor-toolbar').forEach(tb => {
    if (tb.innerHTML === '') {
      tb.innerHTML = buttonsHtml;
    }
  });
}
```

**Risks:**

1. **Backward Compatibility:** If external code depends on `TOOLBAR_HTML` constant
2. **Performance:** Map over array for each toolbar (acceptable for initialization)

**Mitigation:**

1. Keep `TOOLBAR_HTML` as a computed property during migration
2. Add a migration script to update toolbar HTML
3. Measure performance impact (likely negligible)

## Validation Steps

1. Test all toolbar buttons in Chrome/Firefox/Edge
2. Verify range preservation across multiple operations
3. Paste malicious HTML and verify sanitization
4. Test undo/redo after toolbar operations
5. Verify cursor positioning in code blocks and lists
6. Test comment save/edit flow
7. Verify active state highlighting on toggle buttons

## Rollout Strategy

1. **Phase 1**: Fix HTML syntax error (line 823), add debounce
2. **Phase 2**: Implement RangeManager class, refactor execCmd()
3. **Phase 3**: Enhance sanitization with DOMPurify or improved custom implementation
4. **Phase 4**: Unify comment save logic, data-driven toolbar

## Risks

1. **Browser compatibility**: RangeManager behavior may vary across browsers
2. **Performance**: DOMPurify adds ~10KB bundle size (if used)
3. **Migration**: Enhanced sanitization may strip previously accepted HTML

## Out of Scope

- Undo/redo stack management (requires significant architecture changes)
- Mobile touch input handling
- IME input method support
- Rich text paste from external applications (Word, PDF)
- Drag-and-drop content sanitization
