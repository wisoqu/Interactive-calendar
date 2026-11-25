#!/bin/sh
set -eu

DATA_DIR="$(dirname "${SQLITE_DB_PATH:-/app/data/calendar_db.sqlite}")"
mkdir -p "$DATA_DIR"

if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DATA_DIR"
  exec su-exec node "$@"
fi

exec "$@"
