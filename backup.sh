#!/usr/bin/env bash
#
# Резервная копия базы SQLite и настроек .env.
#
# Кратко останавливает контейнер, чтобы копия WAL-файлов была согласованной,
# складывает data/ и .env в архив и снова запускает приложение.
#
# Использование:
#   bash backup.sh                 # каталог проекта = каталог скрипта
#   bash backup.sh /opt/interactive-calendar
#   bash backup.sh /opt/interactive-calendar /root/calendar-backup.tgz
#
set -Eeuo pipefail

PROJECT_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
ARCHIVE="${2:-$HOME/calendar-backup-$(date +%Y-%m-%d_%H%M%S).tgz}"

if [ ! -f "$PROJECT_DIR/docker-compose.yml" ] || [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "Ошибка: в $PROJECT_DIR нет docker-compose.yml и/или .env." >&2
  echo "Укажите каталог установки: bash backup.sh /opt/interactive-calendar" >&2
  exit 1
fi

cd "$PROJECT_DIR"

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "Ошибка: Docker Compose не найден." >&2
  exit 1
fi

STOPPED=0
restart_app() {
  if [ "$STOPPED" = "1" ]; then
    echo "Запускаем приложение обратно..."
    "${COMPOSE[@]}" start >/dev/null 2>&1 || "${COMPOSE[@]}" up -d >/dev/null 2>&1 || true
  fi
}
trap restart_app EXIT

echo "Останавливаем контейнер для согласованной копии базы..."
"${COMPOSE[@]}" stop
STOPPED=1

echo "Создаём архив: $ARCHIVE"
mkdir -p "$(dirname "$ARCHIVE")"
tar czf "$ARCHIVE" -C "$PROJECT_DIR" data .env
chmod 600 "$ARCHIVE"

SIZE="$(du -h "$ARCHIVE" | cut -f1)"
echo "Готово: $ARCHIVE ($SIZE)"

restart_app
STOPPED=0
trap - EXIT
echo "Приложение снова запущено."
