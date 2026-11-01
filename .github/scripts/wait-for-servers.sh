#!/usr/bin/env bash
# Waits for backend and frontend. Run as: timeout 30 bash .github/scripts/wait-for-servers.sh
# Creates ci-logs/<name>.ready when a server answers. Exit 0: both ready. Exit 1: a server
# process exited early. The 30 s hard cap is applied by the caller through timeout.
set -u
mkdir -p ci-logs
rm -f ci-logs/backend.ready ci-logs/frontend.ready

check() {  # usage: check <name> <url>
  local name=$1 url=$2
  [ -f "ci-logs/$name.ready" ] && return 0
  if ! kill -0 "$(cat "ci-logs/$name.pid")" 2>/dev/null; then
    echo "::error::The $name process exited before becoming ready"
    return 2
  fi
  if curl -sf --connect-timeout 1 --max-time 2 "$url" > /dev/null; then
    echo "$name ready after ${SECONDS}s"
    touch "ci-logs/$name.ready"
  fi
  return 0
}

while true; do
  check backend http://localhost:3000/api/health || exit 1
  check frontend http://localhost:5173 || exit 1
  if [ -f ci-logs/backend.ready ] && [ -f ci-logs/frontend.ready ]; then
    echo "Both servers ready after ${SECONDS}s"
    exit 0
  fi
  sleep 1
done
