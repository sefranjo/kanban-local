#!/usr/bin/env node
const http = require("http");
const fsp = require("fs/promises");
const fssync = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

// ─── Preferences (key-value store persisted to disk) ────────────────
const PREFS_FILE = path.join(__dirname, "kanban_prefs.json");
let preferences = {};

try {
  const raw = fssync.readFileSync(PREFS_FILE, "utf-8");
  if (raw.trim()) preferences = JSON.parse(raw);
} catch (_) {} // fresh start

// Guard against concurrent writes from multiple server processes (file-level atomic rename is the real protection)

// Flush on shutdown so last-writer wins (not perfect, but better than losing data silently)
process.on("SIGTERM", () => { try { savePreferences(); process.exit(0); } catch(_) { process.exit(1); }});
process.on("SIGHUP",  () => { try { savePreferences(); process.exit(0); } catch(_) { process.exit(1); }});

let currentSaveTarget = null; // { path, name } set via POST /api/setup-save

// ─── Helpers ──────────────────────────────────────────

function ensureDir(dir) {
  if (!dir) return dir;
  try { fssync.mkdirSync(dir, { recursive: true }); } catch (e) {}
}

async function parseBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk.toString();
  try { return JSON.parse(body); } catch(e) { throw new Error('Invalid JSON in request body'); }
}

function jsonResponse(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// ─── API Endpoints ────────────────────────────────────

async function handleApi(req, res) {
  const urlPath = req.url;
  if (!urlPath.startsWith('/api/')) return false;

  // Parse /api/{endpoint}?{query} → endpoint + query params
  let afterApi = urlPath.replace(/^\/api/, '');
  if (afterApi === '') afterApi = '/';
  let [cleanPath, qsStr] = afterApi.split('?');
  cleanPath = cleanPath.replace(/\/$/, '').replace(/^\//, '') || '';

  // Parse query params
  const qsParams = {};
  for (const part of (qsStr || '').split('&')) {
    const [k, v] = part.split('=');
    if (k) qsParams[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }

  // ── GET /preferences?key=... → value JSON or error ─────
  if (cleanPath === 'preferences' && req.method === 'GET') {
    const key = qsParams.key;
    if (!key) return jsonResponse(res, 400, { error: 'Missing ?key=' });
    const val = preferences[key];
    if (val === undefined || val === null) return jsonResponse(res, 404, { error: 'Key not found' });
    let parsed = val;
    if (typeof val === 'string') {
      try { parsed = JSON.parse(val); } catch(e) {}
    }
    return jsonResponse(res, 200, { key, value: parsed });
  }

  // ── POST /preferences → { key, value } ───────────────
  if (cleanPath === 'preferences' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const key = typeof body.key === 'string' ? body.key.trim() : '';
      if (!key) return jsonResponse(res, 400, { error: 'Missing key' });

      preferences[key] = body.value;
      savePreferences();
      return jsonResponse(res, 200, { ok: true });
    } catch (e) {
      console.error('[api/preferences]', e.message.slice(0, 150));
      return jsonResponse(res, 500, { error: 'Preferences save failed' });
    }
  }

  // ── POST /setup-save → { path: "..." } ────────────────
  if (cleanPath === 'setup-save' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      let targetPath = (typeof body.path === 'string' ? body.path.trim() : '') || '';

      if (!targetPath || !/^\/[a-zA-Z]/.test(targetPath)) return jsonResponse(res, 400, { error: 'Path must be an absolute POSIX path' });

      // Validate extension
      const ext = path.extname(targetPath).toLowerCase();
      if (ext !== '.sqlite' && ext !== '.db') return jsonResponse(res, 400, { error: 'File must end with .sqlite or .db' });

      ensureDir(path.dirname(targetPath));

      currentSaveTarget = { path: targetPath, name: path.basename(targetPath) };
      return jsonResponse(res, 200, { success: true, path: targetPath });
    } catch (e) {
      console.error('[api/setup-save]', e.message.slice(0, 150));
      return jsonResponse(res, 500, { error: e.message.slice(0, 100) });
    }
  }

  // ── POST /save-db → binary payload + path header ───────
  if (cleanPath === 'save-db' && req.method === 'POST') {
    const target = currentSaveTarget;
    if (!target) return jsonResponse(res, 400, { error: 'No save target set. Call /api/setup-save first.' });

    try {
      let targetPath = target.path;

      // Allow header override for path (browser sends this to match a different file than setup-save recorded)
      const headerPath = req.headers['x-target-path'];
      if (headerPath && typeof headerPath === 'string' && !/\.tmp\./.test(headerPath)) {
        targetPath = headerPath.trim();
      }

      // Validate path is absolute and ends with correct extension
      if (!/^\/[a-zA-Z]/.test(targetPath) || !/\.(sqlite|db)$/i.test(targetPath)) {
        return jsonResponse(res, 400, { error: 'Invalid target path' });
      }

      const body = await parseBody(req);
      const b64 = typeof body.data === 'string' ? body.data : '';

      if (!b64) return jsonResponse(res, 400, { error: 'Missing data field (base64)' });

      const bytes = Buffer.from(b64, 'base64');

      ensureDir(path.dirname(targetPath));
      const tmpFile = `${targetPath}.tmp.${crypto.randomBytes(6).toString('hex')}`;

      await fsp.writeFile(tmpFile, bytes);
      await fsp.rename(tmpFile, targetPath);

      return jsonResponse(res, 200, { success: true, bytesWritten: bytes.length });
    } catch (e) {
      console.error('[api/save-db]', e.message.slice(0, 150));
      return jsonResponse(res, 500, { error: e.message.slice(0, 200) });
    }
  }

  // ── POST /open-file → stream file as binary response ───
  if (cleanPath === 'open-file' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      let targetPath = typeof body.path === 'string' ? body.path.trim() : '';

      if (!targetPath || !/^\/[a-zA-Z]/.test(targetPath)) return jsonResponse(res, 400, { error: 'Path must be an absolute POSIX path' });

      // Validate extension
      const ext = path.extname(targetPath).toLowerCase();
      if (ext !== '.sqlite' && ext !== '.db') return jsonResponse(res, 400, { error: 'File must end with .sqlite or .db' });

      const buf = await fsp.readFile(targetPath);

      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(buf.length),
        'X-Target-Path': targetPath,
        'X-File-Size': String(buf.length)
      });
      return res.end(buf);
    } catch (e) {
      console.error('[api/open-file]', e.message.slice(0, 150));
      if (e.code === 'ENOENT') return jsonResponse(res, 404, { error: 'File not found' });
      return jsonResponse(res, 500, { error: e.message.slice(0, 200) });
    }
  }

  // ── GET /list?path=<encoded> → JSON directory listing ───
  if (cleanPath === 'list' && req.method === 'GET') {
    try {
      const targetDir = qsParams.path || null; // empty/null = use home dir
      let resolvedTarget = targetDir || process.env.HOME || os.homedir() || '';

      ensureDir(resolvedTarget);
      let entries;
      try { entries = await fsp.readdir(resolvedTarget, { withFileTypes: true }); } catch (e) {
        return jsonResponse(res, 403, { error: `Cannot access ${resolvedTarget}: ${e.message.slice(0, 80)}` });
      }

      // Filter to interesting files/dirs only
      const results = entries.map(e => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        size: e.isDirectory() ? null : e.size
      }))
      .filter(e => {
        if (e.name.startsWith('.')) return false;
        // Show directories and only .sqlite/.db files
        if (!e.isDirectory) {
          const ext = path.extname(e.name).toLowerCase();
          if (ext !== '.sqlite' && ext !== '.db') return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));

      // Remove parent dir from listing to keep it clean
      const filtered = results.filter(e => e.name !== '..');

      return jsonResponse(res, 200, { path: resolvedTarget, entries: filtered });
    } catch (e) {
      console.error('[api/list]', e.message.slice(0, 150));
      return jsonResponse(res, 500, { error: e.message.slice(0, 150) });
    }
  }

  // Not an API endpoint — fall through to static file serving
  return false;
}

// ─── Server Setup ──────────────────────────────────────

const PORT = 8089;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif"
};

const server = http.createServer(async (req, res) => {
  try {
    // Check if it's an API endpoint
    const apiHandled = await handleApi(req, res);
    if (apiHandled) return;

    // Static file serving (unchanged from original)
    let urlPath = req.url === '/' ? '/index.html' : new URL(req.url, `http://localhost:${PORT}`).pathname;

    const safeUrl = decodeURIComponent(urlPath || '');
    const safePath = path.join(ROOT_DIR, safeUrl);
    if (!safePath.startsWith(ROOT_DIR)) { res.writeHead(403); return res.end('Forbidden'); }

    const stats = await fsp.stat(safePath);
    if (stats.isDirectory()) { res.writeHead(301, { Location: '/' }); return res.end(); }

    const ext = path.extname(urlPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    try {
      const data = await fsp.readFile(safePath);
      res.writeHead(200, { 'Content-Type': contentType });
      return res.end(data);
    } catch (_) {
      res.writeHead(404);
      return res.end('Not found');
    }

  } catch (e) {
    console.error('Server error:', e.message);
    if (!res.writableEnded) {
      try {
        res.writeHead(e.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
        return res.end(`Error: ${e.message.slice(0, 128)}`);
      } catch (_) {}
    }
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('Kanban Board — API available at http://localhost:' + PORT);
  server.on('error', (e) => console.error('[Server]', e.message));
});
