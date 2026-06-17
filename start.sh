#!/bin/bash
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Try Node first, then Python
if command -v node &>/dev/null; then
  PORT=${1:-8089}
  echo "Starting server on http://localhost:$PORT"
  nohup node server.js > /tmp/kanban-server.log 2>&1 &
  SERVER_PID=$!
elif command -v python3 &>/dev/null; then
  PORT=${1:-8089}
  echo "Starting server on http://localhost:$PORT"
  nohup python3 -m http.server "$PORT" > /tmp/kanban-server.log 2>&1 &
  SERVER_PID=$!
elif command -v python &>/dev/null; then
  PORT=${1:-8080}
  echo "Starting server on http://localhost:$PORT"
  nohup python -m SimpleHTTPServer "$PORT" > /tmp/kanban-server.log 2>&1 &
  SERVER_PID=$!
else
  echo "Error: Neither Node.js nor Python found. Install one to run this server."
  exit 1
fi

# Wait briefly and check if the process is still alive
sleep 0.5
if kill -0 $SERVER_PID 2>/dev/null; then
  echo "Server running (PID: $SERVER_PID) — open http://localhost:$PORT in your browser"
else
  echo "Failed to start server. Check /tmp/kanban-server.log for details."
  cat /tmp/kanban-server.log
  exit 1
fi
