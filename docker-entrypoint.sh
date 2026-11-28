#!/bin/sh
set -eu

# Resolve a possibly relative SQLite path against /app, then make sure its
# directory exists and is writable by the unprivileged "node" user.
DB_PATH="${SQLITE_DB_PATH:-/app/data/calendar_db.sqlite}"
case "$DB_PATH" in
  /*) ;;
  *) DB_PATH="/app/${DB_PATH#./}" ;;
esac
DATA_DIR="$(dirname "$DB_PATH")"
if [ "$DATA_DIR" = "/" ]; then
  DATA_DIR="/app/data"
fi
mkdir -p "$DATA_DIR"

if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DATA_DIR"
  exec su-exec node "$@"
fi

exec "$@"
