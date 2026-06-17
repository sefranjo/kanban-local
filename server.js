#!/usr/bin/env node
const http = require("http");
const fs = require("fs");
const path = require("path");

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
  ".gif": "image/gif",
};

const server = http.createServer((req, res) => {
  let urlPath = req.url === "/" ? "/index.html" : req.url;

  try {
    // Prevent directory traversal
    const safePath = path.join(ROOT_DIR, urlPath);
    if (!safePath.startsWith(ROOT_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    const stats = fs.statSync(safePath);

    if (stats.isDirectory()) {
      res.writeHead(301, { Location: "/" });
      return res.end();
    }

    const ext = path.extname(urlPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    fs.readFile(safePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end("Not found");
      }
      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    });

  } catch (e) {
    res.writeHead(500);
    res.end(e.message);
  }
});

server.listen(PORT, () => {
  console.log("");
  console.log("Kanban Board");
  console.log(`http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop\n");
});
