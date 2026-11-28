#!/usr/bin/env bash
#
# Установщик «Интерактивный школьный календарь» (Production).
#
# Одна команда на чистом Ubuntu/Debian:
#   bash <(curl -Ls https://raw.githubusercontent.com/wisoqu/Interactive-calendar/main/install.sh)
#
# Полностью неинтерактивный режим (для автоматизации/тестов):
#   bash install.sh --yes --dir /opt/interactive-calendar \
#     --domain calendar.example.ru --email admin@example.ru
#
# Требуется bash 4+ (ассоциативные изменения строк, массивы). Даём понятную ошибку
# вместо синтаксической, если скрипт случайно запустили через sh.
if [ -z "${BASH_VERSION:-}" ]; then
  echo "Ошибка: установщик требует bash. Запустите: bash install.sh" >&2
  exit 1
fi

set -Eeuo pipefail

export DEBIAN_FRONTEND=noninteractive

# ------------------------------------------------------------------------------
# Оформление и журналирование
# ------------------------------------------------------------------------------
if [ -t 1 ]; then
  GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
  RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
else
  GREEN=''; YELLOW=''; CYAN=''; RED=''; BOLD=''; NC=''
fi

log_info() { printf '%b\n' "${GREEN}$*${NC}"; }
log_step() { printf '%b\n' "${GREEN}$*${NC}"; }
log_ok()   { printf '%b\n' "${GREEN}  ✓ $*${NC}"; }
log_warn() { printf '%b\n' "${YELLOW}  ! $*${NC}"; }
log_err()  { printf '%b\n' "${RED}$*${NC}" >&2; }

# ------------------------------------------------------------------------------
# Значения по умолчанию (можно переопределить флагами или переменными окружения)
# ------------------------------------------------------------------------------
REPO_URL="${REPO_URL:-https://github.com/wisoqu/Interactive-calendar.git}"
INSTALL_REF="${INSTALL_REF:-main}"
DEFAULT_INSTALL_DIR="${INSTALL_DIR:-/opt/interactive-calendar}"
APP_PORT="${APP_PORT:-3000}"
HEALTH_WAIT_SECONDS="${HEALTH_WAIT_SECONDS:-90}"

INSTALL_DIR="${INSTALL_DIR:-}"
DOMAIN_NAME="${DOMAIN:-}"
CERT_EMAIL="${CERT_EMAIL:-}"
ASSUME_YES="${ASSUME_YES:-0}"
CONFIGURE_SWAP="${CONFIGURE_SWAP:-ask}"
SKIP_SSL="${SKIP_SSL:-0}"
RECONFIGURE_ENV="${RECONFIGURE_ENV:-ask}"

SMTP_HOST_IN="${SMTP_HOST:-}"
SMTP_PORT_IN="${SMTP_PORT:-}"
SMTP_USER_IN="${SMTP_USER:-}"
SMTP_PASS_IN="${SMTP_PASS:-}"
SMTP_FROM_IN="${SMTP_FROM:-}"

# Каталоги Nginx можно переопределить (используется тестовым стендом).
NGINX_SITES_AVAILABLE_DIR="${NGINX_SITES_AVAILABLE_DIR:-/etc/nginx/sites-available}"
NGINX_SITES_ENABLED_DIR="${NGINX_SITES_ENABLED_DIR:-/etc/nginx/sites-enabled}"
LETSENCRYPT_LIVE_DIR="${LETSENCRYPT_LIVE_DIR:-/etc/letsencrypt/live}"

SUDO=()
COMPOSE=()
INSTALL_LOG_FILE="${INSTALL_LOG_FILE:-}"

usage() {
  cat <<'USAGE'
Использование: bash install.sh [параметры]

Параметры:
  -y, --yes                 Не задавать вопросов, использовать значения по умолчанию
      --dir <путь>          Каталог установки (по умолчанию /opt/interactive-calendar)
      --domain <домен>      Домен для Nginx + Let's Encrypt (например, calendar.school42.ru)
      --email <адрес>       Email для Let's Encrypt (можно пропустить)
      --port <номер>        Порт приложения на сервере (по умолчанию 3000)
      --ref <ветка/тег>     Ветка или тег репозитория (по умолчанию main)
      --no-ssl              Не настраивать домен, Nginx и HTTPS
      --no-swap             Не предлагать создание файла подкачки
      --smtp-host <host>    SMTP-сервер для писем восстановления пароля
      --smtp-port <порт>    Порт SMTP (по умолчанию 587, либо 465 для SSL)
      --smtp-user <логин>   Логин почты
      --smtp-pass <пароль>  Пароль приложения SMTP
      --smtp-from <строка>  Отправитель писем
      --reconfigure-env     Перезаписать существующий .env
  -h, --help                Показать эту справку

Примеры:
  bash install.sh
  bash install.sh --yes --domain calendar.school42.ru --email admin@school42.ru
USAGE
}

need_arg() {
  if [ $# -lt 2 ] || [ -z "$2" ]; then
    log_err "Параметру $1 требуется значение."
    exit 2
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    -y|--yes) ASSUME_YES=1; shift ;;
    --dir) need_arg "$@"; INSTALL_DIR="$2"; shift 2 ;;
    --domain) need_arg "$@"; DOMAIN_NAME="$2"; shift 2 ;;
    --email) need_arg "$@"; CERT_EMAIL="$2"; shift 2 ;;
    --port) need_arg "$@"; APP_PORT="$2"; shift 2 ;;
    --ref) need_arg "$@"; INSTALL_REF="$2"; shift 2 ;;
    --no-ssl) SKIP_SSL=1; shift ;;
    --no-swap) CONFIGURE_SWAP=0; shift ;;
    --reconfigure-env) RECONFIGURE_ENV=1; shift ;;
    --smtp-host) need_arg "$@"; SMTP_HOST_IN="$2"; shift 2 ;;
    --smtp-port) need_arg "$@"; SMTP_PORT_IN="$2"; shift 2 ;;
    --smtp-user) need_arg "$@"; SMTP_USER_IN="$2"; shift 2 ;;
    --smtp-pass) need_arg "$@"; SMTP_PASS_IN="$2"; shift 2 ;;
    --smtp-from) need_arg "$@"; SMTP_FROM_IN="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) log_err "Неизвестный параметр: $1"; echo; usage; exit 2 ;;
  esac
done

# ------------------------------------------------------------------------------
# Журнал установки + понятное сообщение при ошибке
# ------------------------------------------------------------------------------
if [ -z "$INSTALL_LOG_FILE" ]; then
  if [ -w /var/log ] || [ "$(id -u)" = "0" ]; then
    INSTALL_LOG_FILE="/var/log/interactive-calendar-install.log"
  else
    INSTALL_LOG_FILE="${HOME:-/tmp}/interactive-calendar-install.log"
  fi
fi

# Дублируем весь вывод в журнал (подсказки при этом остаются в /dev/tty).
exec > >(tee -a "$INSTALL_LOG_FILE") 2>&1

on_error() {
  local exit_code=$?
  echo
  log_err "==============================================================="
  log_err " Установка прервана (код ${exit_code})."
  log_err " Команда: ${BASH_COMMAND}"
  log_err " Журнал:  ${INSTALL_LOG_FILE}"
  if [ -n "${INSTALL_DIR:-}" ] && [ -d "${INSTALL_DIR:-}" ]; then
    log_err " Логи:    cd ${INSTALL_DIR} && docker compose logs --tail=100"
    log_err " Git:     cd ${INSTALL_DIR} && git status"
  fi
  log_err "==============================================================="
  exit "$exit_code"
}
trap on_error ERR

# ------------------------------------------------------------------------------
# Ввод с терминала (работает при запуске через bash <(curl ...) и curl | bash)
# ------------------------------------------------------------------------------
interactive_input_possible() {
  [ "$ASSUME_YES" != "1" ] || return 1
  # Проверяем, что /dev/tty действительно можно открыть (в cron/CI его может не быть).
  { exec 3<>/dev/tty; } 2>/dev/null || return 1
  exec 3>&-
  return 0
}

prompt_input() {
  local prompt_text="$1"
  local var_name="$2"
  local default_val="${3:-}"
  local input_val=""

  if [ "$ASSUME_YES" = "1" ]; then
    printf -v "$var_name" '%s' "$default_val"
    return 0
  fi

  if interactive_input_possible; then
    printf "%b" "$prompt_text" > /dev/tty
    IFS= read -r input_val < /dev/tty || true
  else
    printf "%b" "$prompt_text"
    IFS= read -r input_val || true
  fi

  if [ -z "$input_val" ] && [ -n "$default_val" ]; then
    input_val="$default_val"
  fi
  printf -v "$var_name" '%s' "$input_val"
}

prompt_secret() {
  local prompt_text="$1"
  local var_name="$2"
  local input_val=""

  if [ "$ASSUME_YES" = "1" ]; then
    printf -v "$var_name" ''
    return 0
  fi

  if interactive_input_possible; then
    printf "%b" "$prompt_text" > /dev/tty
    IFS= read -rs input_val < /dev/tty || true
    printf "\n" > /dev/tty
  else
    printf "%b" "$prompt_text"
    IFS= read -rs input_val || true
    printf "\n"
  fi
  printf -v "$var_name" '%s' "$input_val"
}

ask_yes_no() {
  local prompt_text="$1"
  local default_val="${2:-Y}"
  local answer=""
  prompt_input "$prompt_text" answer "$default_val"
  [[ "$answer" =~ ^[YyДд] ]]
}

# ------------------------------------------------------------------------------
# Вспомогательные функции .env, домена и валидации
# ------------------------------------------------------------------------------
format_env_val() {
  local val="$1"
  if [ -z "$val" ]; then
    printf ''
  elif [[ "$val" =~ ^[a-zA-Z0-9._@:/+-]+$ ]]; then
    printf '%s' "$val"
  elif [[ "$val" == *'$'* || "$val" == *'`'* ]] && [[ "$val" != *"'"* ]]; then
    # Single quotes stop Docker Compose from interpolating $VAR in env_file.
    printf "'%s'" "$val"
  else
    val="${val//\\/\\\\}"
    val="${val//\"/\\\"}"
    printf '"%s"' "$val"
  fi
}

normalize_domain() {
  local raw="$1"
  raw="${raw#"${raw%%[![:space:]]*}"}"
  raw="${raw%"${raw##*[![:space:]]}"}"
  raw="${raw#http://}"
  raw="${raw#https://}"
  raw="${raw%%/*}"
  raw="${raw%%:*}"
  raw="${raw,,}"
  printf '%s' "$raw"
}

is_valid_domain() {
  [[ "$1" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]]
}

is_valid_email() {
  [[ "$1" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]
}

# apt может быть заблокирован unattended-upgrades сразу после загрузки VPS.
apt_update() {
  local attempt
  for attempt in 1 2 3; do
    if "${SUDO[@]}" apt-get update -qq; then
      return 0
    fi
    log_warn "apt-get update не удался (попытка ${attempt}/3), ждём 5 секунд..."
    sleep 5
  done
  return 1
}

apt_install() {
  local attempt
  for attempt in 1 2 3; do
    if "${SUDO[@]}" apt-get install -y -qq "$@"; then
      return 0
    fi
    log_warn "apt-get install не удался (попытка ${attempt}/3), ждём 5 секунд..."
    sleep 5
  done
  return 1
}

read_env_value() {
  local file="$1"
  local key="$2"
  [ -f "$file" ] || return 0
  awk -F= -v k="$key" '
    $1 == k {
      sub(/^[^=]*=/, "");
      gsub(/^"|"$/, "");
      print;
      exit
    }
  ' "$file"
}

set_env_key() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp_file
  tmp_file="$(mktemp)"
  if [ -f "$file" ]; then
    awk -v k="$key" -v v="$value" '
      BEGIN { replaced = 0 }
      $0 ~ ("^" k "=") { print k "=" v; replaced = 1; next }
      { print }
      END { if (!replaced) print k "=" v }
    ' "$file" > "$tmp_file"
  else
    printf '%s=%s\n' "$key" "$value" > "$tmp_file"
  fi
  mv "$tmp_file" "$file"
  chmod 600 "$file"
}

# Добавляет ключ только если его ещё нет (не перетирает существующую настройку).
ensure_env_key() {
  local file="$1"
  local key="$2"
  local value="$3"
  if ! grep -q "^${key}=" "$file" 2>/dev/null; then
    set_env_key "$file" "$key" "$value"
  fi
}

# ------------------------------------------------------------------------------
# Баннер и проверка прав
# ------------------------------------------------------------------------------
echo
log_info "================================================================="
log_info "${BOLD}   Установщик «Интерактивный школьный календарь» (Production)   ${NC}"
log_info "================================================================="
echo "  Журнал установки: ${INSTALL_LOG_FILE}"
echo ""

if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO=(sudo)
    log_warn "Скрипт запущен не от root — системные команды выполняются через sudo."
  else
    log_err "Ошибка: запустите скрипт от имени root или установите пакет sudo."
    exit 1
  fi
fi

if ! [[ "$APP_PORT" =~ ^[0-9]+$ ]] || [ "$APP_PORT" -lt 1 ] || [ "$APP_PORT" -gt 65535 ]; then
  log_err "Ошибка: некорректный порт приложения «${APP_PORT}» (ожидается 1–65535)."
  exit 2
fi

if [ -n "$DOMAIN_NAME" ]; then
  DOMAIN_NAME="$(normalize_domain "$DOMAIN_NAME")"
  if ! is_valid_domain "$DOMAIN_NAME"; then
    log_err "Ошибка: некорректное доменное имя «${DOMAIN_NAME}»."
    exit 2
  fi
fi

# ------------------------------------------------------------------------------
# Шаг 1. Проверка ресурсов: ОЗУ и SWAP для бюджетных VPS
# ------------------------------------------------------------------------------
log_step "[1/6] Проверка ресурсов сервера..."
if [ -f /proc/meminfo ]; then
  TOTAL_RAM_MB=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)
  TOTAL_SWAP_MB=$(awk '/SwapTotal/ {printf "%d", $2/1024}' /proc/meminfo)
  printf '%b\n' "  Обнаружено ОЗУ: ${BOLD}${TOTAL_RAM_MB} МБ${NC} | SWAP (подкачка): ${BOLD}${TOTAL_SWAP_MB} МБ${NC}"

  if [ "$TOTAL_RAM_MB" -lt 1800 ] && [ "$TOTAL_SWAP_MB" -lt 512 ] && [ "$CONFIGURE_SWAP" != "0" ]; then
    log_warn "На сервере менее 2 ГБ ОЗУ и не настроен SWAP."
    echo "  Для быстрой и безошибочной сборки проекта на недорогом VPS рекомендуется добавить 2 ГБ SWAP."
    if [ "$CONFIGURE_SWAP" = "1" ] || ask_yes_no "  ${YELLOW}[НЕОБЯЗАТЕЛЬНО] Создать файл подкачки SWAP (2 ГБ)? [Y/n]: ${NC}" "Y"; then
      if [ ! -f /swapfile ]; then
        echo "  Создание /swapfile (2 ГБ)..."
        if "${SUDO[@]}" fallocate -l 2G /swapfile 2>/dev/null || "${SUDO[@]}" dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none; then
          "${SUDO[@]}" chmod 600 /swapfile
          if "${SUDO[@]}" mkswap /swapfile >/dev/null 2>&1 && "${SUDO[@]}" swapon /swapfile >/dev/null 2>&1; then
            if ! grep -q '^/swapfile' /etc/fstab 2>/dev/null; then
              echo '/swapfile none swap sw 0 0' | "${SUDO[@]}" tee -a /etc/fstab >/dev/null
            fi
            log_ok "Файл подкачки SWAP (2 ГБ) подключен."
          else
            "${SUDO[@]}" rm -f /swapfile || true
            log_warn "Хостинг не разрешает создание SWAP. Продолжаем без него."
          fi
        else
          log_warn "Не удалось создать /swapfile. Продолжаем без SWAP."
        fi
      else
        log_warn "Файл /swapfile уже существует, пропускаем создание."
      fi
    fi
  fi
fi
echo ""

# ------------------------------------------------------------------------------
# Шаг 2. Системные пакеты: git, curl, Docker, Docker Compose
# ------------------------------------------------------------------------------
log_step "[2/6] Проверка системных пакетов (Git, Docker, Docker Compose)..."

if ! command -v git >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    echo "  Устанавливаем базовые утилиты (git, curl, ca-certificates)..."
    apt_update
    apt_install git curl ca-certificates
  else
    log_err "Ошибка: установите пакеты git и curl вручную и повторите запуск."
    exit 1
  fi
fi

if ! command -v docker >/dev/null 2>&1; then
  log_warn "Docker не установлен на этом сервере."
  if [ "$ASSUME_YES" = "1" ] || ask_yes_no "  ${YELLOW}[ОБЯЗАТЕЛЬНО] Установить Docker автоматически с официального сайта? [Y/n]: ${NC}" "Y"; then
    if ! curl -fsSL https://get.docker.com | "${SUDO[@]}" sh; then
      log_err "Не удалось установить Docker через get.docker.com."
      log_err "Установите Docker вручную: https://docs.docker.com/engine/install/"
      exit 1
    fi
    if command -v systemctl >/dev/null 2>&1; then
      "${SUDO[@]}" systemctl enable --now docker || true
    fi
    log_ok "Docker установлен."
  else
    log_err "Установка прервана: для работы приложения необходим Docker."
    exit 1
  fi
else
  if command -v systemctl >/dev/null 2>&1; then
    "${SUDO[@]}" systemctl enable --now docker >/dev/null 2>&1 || true
  fi
fi

DOCKER=()
if ! docker info >/dev/null 2>&1; then
  DOCKER=("${SUDO[@]}")
fi

if "${DOCKER[@]}" docker compose version >/dev/null 2>&1; then
  COMPOSE=("${DOCKER[@]}" docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=("${DOCKER[@]}" docker-compose)
else
  if command -v apt-get >/dev/null 2>&1; then
    echo "  Устанавливаем плагин Docker Compose..."
    apt_update
    if apt_install docker-compose-plugin >/dev/null 2>&1 \
      && "${DOCKER[@]}" docker compose version >/dev/null 2>&1; then
      COMPOSE=("${DOCKER[@]}" docker compose)
    elif apt_install docker-compose-v2 >/dev/null 2>&1 \
      && "${DOCKER[@]}" docker compose version >/dev/null 2>&1; then
      COMPOSE=("${DOCKER[@]}" docker compose)
    elif apt_install docker-compose >/dev/null 2>&1 \
      && command -v docker-compose >/dev/null 2>&1; then
      COMPOSE=("${DOCKER[@]}" docker-compose)
    else
      log_err "Ошибка: не удалось установить Docker Compose. Установите docker-compose-plugin вручную."
      exit 1
    fi
  else
    log_err "Ошибка: плагин Docker Compose не найден. Установите docker-compose-plugin."
    exit 1
  fi
fi
log_ok "Инструменты готовы (${COMPOSE[*]})."
echo ""

# ------------------------------------------------------------------------------
# Шаг 3. Каталог установки и загрузка исходного кода
# ------------------------------------------------------------------------------
log_step "[3/6] Загрузка приложения..."

if [ -z "$INSTALL_DIR" ]; then
  prompt_input "${YELLOW}  [ОБЯЗАТЕЛЬНО] Папка установки [Enter = ${DEFAULT_INSTALL_DIR}]: ${NC}" INSTALL_DIR "$DEFAULT_INSTALL_DIR"
fi
if [ -z "$INSTALL_DIR" ]; then
  INSTALL_DIR="$DEFAULT_INSTALL_DIR"
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "  Каталог ${INSTALL_DIR} уже содержит репозиторий. Обновляем код (ref: ${INSTALL_REF})..."
  if [ -n "${SUDO[*]}" ]; then
    "${SUDO[@]}" chown -R "$(id -u):$(id -g)" "$INSTALL_DIR"
  fi
  git -c "safe.directory=$INSTALL_DIR" -C "$INSTALL_DIR" fetch --prune origin "$INSTALL_REF"
  git -c "safe.directory=$INSTALL_DIR" -C "$INSTALL_DIR" checkout "$INSTALL_REF"
  git -c "safe.directory=$INSTALL_DIR" -C "$INSTALL_DIR" pull --ff-only origin "$INSTALL_REF"
elif [ -d "$INSTALL_DIR" ] && [ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
  if [ ! -f "$INSTALL_DIR/package.json" ] || [ ! -f "$INSTALL_DIR/server.ts" ]; then
    log_err "Каталог ${INSTALL_DIR} не пуст и не похож на проект Interactive Calendar."
    log_err "Укажите другой каталог через --dir или очистите его вручную."
    exit 1
  fi
  log_warn "Каталог ${INSTALL_DIR} уже существует — используем текущие файлы (git-обновление пропущено)."
else
  "${SUDO[@]}" mkdir -p "$(dirname "$INSTALL_DIR")"
  "${SUDO[@]}" git clone --branch "$INSTALL_REF" --single-branch "$REPO_URL" "$INSTALL_DIR"
fi

if [ -n "${SUDO[*]}" ]; then
  "${SUDO[@]}" chown -R "$(id -u):$(id -g)" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/data"
log_ok "Исходный код подготовлен в ${INSTALL_DIR}."
echo ""

# ------------------------------------------------------------------------------
# Шаг 4. Настройка .env и почты SMTP
# ------------------------------------------------------------------------------
log_step "[4/6] Настройка параметров окружения и почты (SMTP)..."

ENV_FILE="$INSTALL_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  EXISTING_PORT="$(read_env_value "$ENV_FILE" PORT)"
  if [[ "$EXISTING_PORT" =~ ^[0-9]+$ ]] && [ "$EXISTING_PORT" -ge 1 ] && [ "$EXISTING_PORT" -le 65535 ]; then
    APP_PORT="$EXISTING_PORT"
  fi
  SMTP_USER_SAVED="$(read_env_value "$ENV_FILE" SMTP_USER)"
fi
SMTP_USER_SAVED="${SMTP_USER_SAVED:-$SMTP_USER_IN}"

# Если SMTP-параметры переданы флагами, файл .env нужно пересобрать.
if [ -n "$SMTP_HOST_IN$SMTP_USER_IN$SMTP_PASS_IN" ]; then
  RECONFIGURE_ENV=1
fi

CONFIGURE_ENV="Y"
if [ -f "$ENV_FILE" ] && [ "$RECONFIGURE_ENV" != "1" ]; then
  if [ "$ASSUME_YES" = "1" ]; then
    CONFIGURE_ENV="N"
  elif ! ask_yes_no "${YELLOW}  Файл .env уже существует. Перенастроить его заново? [y/N]: ${NC}" "N"; then
    CONFIGURE_ENV="N"
  fi
fi

if [ "$CONFIGURE_ENV" = "N" ]; then
  echo "  Сохранена текущая конфигурация .env."
fi

SMTP_HOST_VALUE=""
SMTP_PORT_VALUE="587"
SMTP_USER_VALUE=""
SMTP_PASS_VALUE=""
SMTP_FROM_VALUE=""
SMTP_SECURE_VALUE="false"

if [ "$CONFIGURE_ENV" = "Y" ]; then
  echo "  --- Настройка отправки писем (восстановление пароля по email) ---"
  printf '%b\n' "  Этот шаг ${BOLD}НЕОБЯЗАТЕЛЕН${NC}: если нажать Enter, календарь будет полностью работать,"
  echo "  но отправка 6-значных кодов сброса пароля на почту будет отключена."
  echo "  Подсказка по популярным почтовым сервисам (нужен «Пароль приложения»!):"
  printf '%b\n' "    • Gmail:   SMTP Host = ${BOLD}smtp.gmail.com${NC},   Port = ${BOLD}587${NC}"
  printf '%b\n' "    • Яндекс:  SMTP Host = ${BOLD}smtp.yandex.ru${NC},  Port = ${BOLD}465${NC}"
  printf '%b\n' "    • Mail.ru: SMTP Host = ${BOLD}smtp.mail.ru${NC},    Port = ${BOLD}465${NC}"
  echo ""

  smtp_host="$SMTP_HOST_IN"
  if [ -z "$smtp_host" ]; then
    prompt_input "${YELLOW}  [НЕОБЯЗАТЕЛЬНО] SMTP Host (или нажмите Enter, чтобы пропустить): ${NC}" smtp_host ""
  fi

  if [ -n "$smtp_host" ]; then
    SMTP_HOST_VALUE="$smtp_host"

    default_smtp_port="${SMTP_PORT_IN:-587}"
    if [ -z "${SMTP_PORT_IN:-}" ] && { [[ "$smtp_host" == *yandex* ]] || [[ "$smtp_host" == *mail.ru* ]]; }; then
      default_smtp_port="465"
    fi

    while true; do
      smtp_port="$default_smtp_port"
      if [ -z "${SMTP_PORT_IN:-}" ] && [ "$ASSUME_YES" != "1" ]; then
        prompt_input "${YELLOW}  [ОБЯЗАТЕЛЬНО для почты] SMTP Port [Enter = ${default_smtp_port}]: ${NC}" smtp_port "$default_smtp_port"
      fi
      if [[ "$smtp_port" =~ ^[0-9]+$ ]] && [ "$smtp_port" -ge 1 ] && [ "$smtp_port" -le 65535 ]; then
        break
      fi
      log_err "  Введите корректный номер порта (от 1 до 65535)."
      SMTP_PORT_IN=""
      default_smtp_port="587"
    done
    SMTP_PORT_VALUE="$smtp_port"

    smtp_user="$SMTP_USER_IN"
    while [ -z "$smtp_user" ]; do
      prompt_input "${YELLOW}  [ОБЯЗАТЕЛЬНО для почты] Логин почты (например, school42@gmail.com): ${NC}" smtp_user ""
      if [ "$ASSUME_YES" = "1" ] && [ -z "$smtp_user" ]; then
        log_err "  В неинтерактивном режиме с SMTP_HOST требуется --smtp-user."
        exit 2
      fi
    done
    SMTP_USER_VALUE="$smtp_user"
    SMTP_USER_SAVED="$smtp_user"

    smtp_pass="$SMTP_PASS_IN"
    while [ -z "$smtp_pass" ]; do
      prompt_secret "${YELLOW}  [ОБЯЗАТЕЛЬНО для почты] Пароль приложения SMTP (ввод скрыт): ${NC}" smtp_pass
      if [ "$ASSUME_YES" = "1" ] && [ -z "$smtp_pass" ]; then
        log_err "  В неинтерактивном режиме с SMTP_HOST требуется --smtp-pass."
        exit 2
      fi
    done
    SMTP_PASS_VALUE="$smtp_pass"

    default_from="Школьный календарь <${smtp_user}>"
    smtp_from="$SMTP_FROM_IN"
    if [ -z "$smtp_from" ]; then
      prompt_input "${YELLOW}  [НЕОБЯЗАТЕЛЬНО] Отправитель письма [Enter = ${default_from}]: ${NC}" smtp_from "$default_from"
    fi
    if [ -z "$smtp_from" ]; then
      smtp_from="$default_from"
    fi
    SMTP_FROM_VALUE="$smtp_from"

    if [ "$SMTP_PORT_VALUE" = "465" ]; then
      SMTP_SECURE_VALUE="true"
    fi
    log_ok "Почта SMTP будет сохранена в .env."
  else
    SMTP_FROM_VALUE="Школьный календарь <no-reply@example.com>"
    log_warn "Настройка почты пропущена (можно заполнить ${ENV_FILE} позже)."
  fi

  {
    echo "NODE_ENV=production"
    echo "PORT=${APP_PORT}"
    echo "BIND_HOST=0.0.0.0"
    echo "LISTEN_HOST=0.0.0.0"
    echo "TRUST_PROXY=0"
    echo "SQLITE_DB_PATH=/app/data/calendar_db.sqlite"
    echo "SMTP_HOST=$(format_env_val "$SMTP_HOST_VALUE")"
    echo "SMTP_PORT=${SMTP_PORT_VALUE}"
    echo "SMTP_USER=$(format_env_val "$SMTP_USER_VALUE")"
    echo "SMTP_PASS=$(format_env_val "$SMTP_PASS_VALUE")"
    echo "SMTP_FROM=$(format_env_val "$SMTP_FROM_VALUE")"
    echo "SMTP_SECURE=${SMTP_SECURE_VALUE}"
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  log_ok "Файл .env сформирован."
else
  # Существующий .env: сохраняем порт, SMTP и настройки прокси нетронутыми,
  # добавляя только отсутствующие ключи (важно при обновлении уже настроенного сервера).
  ensure_env_key "$ENV_FILE" "NODE_ENV" "production"
  ensure_env_key "$ENV_FILE" "BIND_HOST" "0.0.0.0"
  ensure_env_key "$ENV_FILE" "LISTEN_HOST" "0.0.0.0"
  ensure_env_key "$ENV_FILE" "TRUST_PROXY" "0"
  ensure_env_key "$ENV_FILE" "SQLITE_DB_PATH" "/app/data/calendar_db.sqlite"
  log_ok "Существующий .env сохранён (BIND_HOST/TRUST_PROXY не изменены)."
fi

# Перечитываем порт (на случай, если .env уже существовал)
ENV_PORT="$(read_env_value "$ENV_FILE" PORT)"
if [[ "$ENV_PORT" =~ ^[0-9]+$ ]] && [ "$ENV_PORT" -ge 1 ] && [ "$ENV_PORT" -le 65535 ]; then
  APP_PORT="$ENV_PORT"
fi
echo ""

# ------------------------------------------------------------------------------
# Шаг 5. Сборка и запуск контейнера + проверка готовности
# ------------------------------------------------------------------------------
log_step "[5/6] Сборка и запуск контейнера приложения..."
"${COMPOSE[@]}" up -d --build

wait_for_health() {
  local seconds="${1:-$HEALTH_WAIT_SECONDS}"
  local i=0
  printf "  Ожидание готовности /api/health"
  while [ "$i" -lt "$seconds" ]; do
    if curl -fsS --max-time 3 "http://127.0.0.1:${APP_PORT}/api/health/db" >/dev/null 2>&1; then
      echo ""
      return 0
    fi
    printf "."
    sleep 1
    i=$((i + 1))
  done
  echo ""
  return 1
}

if wait_for_health "$HEALTH_WAIT_SECONDS"; then
  log_ok "Сервер и база данных SQLite успешно запущены на порту ${APP_PORT}."
else
  log_err "Приложение не ответило на /api/health/db за ${HEALTH_WAIT_SECONDS} секунд."
  echo "  Последние строки логов контейнера:"
  "${COMPOSE[@]}" logs --tail=80 || true
  exit 1
fi
echo ""

# ------------------------------------------------------------------------------
# Шаг 6. Домен, Nginx и бесплатный HTTPS (Let's Encrypt)
# ------------------------------------------------------------------------------
log_step "[6/6] Настройка домена и защищенного HTTPS-соединения (порт 443)..."

if [ "$SKIP_SSL" = "1" ]; then
  log_warn "Настройка домена и HTTPS пропущена (--no-ssl)."
elif [ -z "$DOMAIN_NAME" ]; then
  echo "  Если у вас есть домен, направленный A-записью на IP этого сервера,"
  echo "  скрипт автоматически настроит Nginx, закроет прямой внешний доступ к порту ${APP_PORT}"
  echo "  и выпустит бесплатный SSL-сертификат Let's Encrypt."
  while true; do
    prompt_input "${YELLOW}  [НЕОБЯЗАТЕЛЬНО] Введите ваш домен (или нажмите Enter для работы по IP:${APP_PORT}): ${NC}" RAW_DOMAIN ""
    if [ -z "$RAW_DOMAIN" ]; then
      DOMAIN_NAME=""
      break
    fi
    NORMALIZED_DOMAIN="$(normalize_domain "$RAW_DOMAIN")"
    if is_valid_domain "$NORMALIZED_DOMAIN"; then
      DOMAIN_NAME="$NORMALIZED_DOMAIN"
      break
    fi
    log_err "  Некорректное доменное имя «${RAW_DOMAIN}». Пример: calendar.school42.ru (или нажмите Enter, чтобы пропустить)."
  done
fi

FINAL_URL=""
if [ -n "$DOMAIN_NAME" ] && [ "$SKIP_SSL" != "1" ]; then
  if ! command -v apt-get >/dev/null 2>&1; then
    log_warn "Автонастройка Nginx поддерживается на системах с apt (Ubuntu/Debian)."
    log_warn "Руководство по ручной настройке: docs/deployment.md"
    DOMAIN_NAME=""
  fi
fi

if [ -n "$DOMAIN_NAME" ] && [ "$SKIP_SSL" != "1" ]; then
  # --- Email для Let's Encrypt ---
  if [ -z "$CERT_EMAIL" ]; then
    default_cert_email="${CERT_EMAIL:-$SMTP_USER_SAVED}"
    prompt_input "${YELLOW}  [НЕОБЯЗАТЕЛЬНО] Email для уведомлений Let's Encrypt [Enter = ${default_cert_email:-пропустить}]: ${NC}" CERT_EMAIL "$default_cert_email"
  fi
  if [ -n "$CERT_EMAIL" ] && ! is_valid_email "$CERT_EMAIL"; then
    log_warn "Email «${CERT_EMAIL}» выглядит некорректно — сертификат будет запрошен без email."
    CERT_EMAIL=""
  fi

  # --- Проверка DNS: предупреждаем, но не блокируем (DNS может обновляться) ---
  SERVER_PUBLIC_IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  if [ -z "$SERVER_PUBLIC_IP" ]; then
    SERVER_PUBLIC_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi
  DOMAIN_IPS=""
  if command -v getent >/dev/null 2>&1; then
    DOMAIN_IPS="$(getent ahostsv4 "$DOMAIN_NAME" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"
  fi
  if [ -n "$SERVER_PUBLIC_IP" ] && [ -n "$DOMAIN_IPS" ]; then
    if ! printf '%s' "$DOMAIN_IPS" | grep -qw "$SERVER_PUBLIC_IP"; then
      log_warn "DNS-запись ${DOMAIN_NAME} указывает на [${DOMAIN_IPS% }], а IP этого сервера — ${SERVER_PUBLIC_IP}."
      log_warn "Если используется Cloudflare/прокси или DNS ещё не обновился, выпуск сертификата может не удаться."
      if [ "$ASSUME_YES" != "1" ] && ! ask_yes_no "  Продолжить настройку HTTPS? [Y/n]: " "Y"; then
        DOMAIN_NAME=""
      fi
    fi
  elif [ -z "$DOMAIN_IPS" ]; then
    log_warn "Не удалось разрешить домен ${DOMAIN_NAME} (DNS ещё не настроен?). Продолжаем — Certbot сообщит подробности."
  fi
fi

if [ -n "$DOMAIN_NAME" ] && [ "$SKIP_SSL" != "1" ]; then
  echo "  Установка Nginx и Certbot..."
  apt_update
  if ! apt_install nginx certbot python3-certbot-nginx; then
    log_err "Не удалось установить Nginx/Certbot (пакеты nginx, certbot, python3-certbot-nginx)."
    exit 1
  fi

  if command -v systemctl >/dev/null 2>&1; then
    "${SUDO[@]}" systemctl enable --now nginx >/dev/null 2>&1 || true
  fi

  NGINX_CONF="${NGINX_SITES_AVAILABLE_DIR}/interactive-calendar"
  NGINX_LINK="${NGINX_SITES_ENABLED_DIR}/interactive-calendar"
  # На VPS с отключённым IPv6 директива listen [::]:80 ломает запуск Nginx.
  NGINX_IPV6_LISTEN=""
  if [ -s /proc/net/if_inet6 ]; then
    NGINX_IPV6_LISTEN="    listen [::]:80;"
  fi
  "${SUDO[@]}" mkdir -p "$NGINX_SITES_AVAILABLE_DIR" "$NGINX_SITES_ENABLED_DIR"
  "${SUDO[@]}" tee "$NGINX_CONF" >/dev/null <<EOF
server {
    listen 80;
${NGINX_IPV6_LISTEN}
    server_name ${DOMAIN_NAME};

    client_max_body_size 2M;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

  "${SUDO[@]}" ln -sf "$NGINX_CONF" "$NGINX_LINK"

  if ! "${SUDO[@]}" nginx -t; then
    log_err "Конфигурация Nginx содержит ошибку. Проверьте ${NGINX_CONF}."
    "${SUDO[@]}" rm -f "$NGINX_LINK" || true
    exit 1
  fi
  if command -v systemctl >/dev/null 2>&1; then
    "${SUDO[@]}" systemctl reload-or-restart nginx
  else
    "${SUDO[@]}" nginx -s reload
  fi

  # Публикуем порт приложения только на loopback: снаружи доступен лишь Nginx (80/443).
  set_env_key "$ENV_FILE" "BIND_HOST" "127.0.0.1"
  set_env_key "$ENV_FILE" "TRUST_PROXY" "1"
  "${COMPOSE[@]}" up -d
  if ! wait_for_health 60; then
    log_err "Приложение не поднялось после переключения BIND_HOST=127.0.0.1."
    "${COMPOSE[@]}" logs --tail=80 || true
    exit 1
  fi

  if command -v ufw >/dev/null 2>&1 && "${SUDO[@]}" ufw status 2>/dev/null | grep -q "Status: active"; then
    "${SUDO[@]}" ufw allow 'Nginx Full' >/dev/null 2>&1 || true
    log_ok "В UFW открыт профиль Nginx Full (80/443)."
  fi
  if command -v firewall-cmd >/dev/null 2>&1 && "${SUDO[@]}" firewall-cmd --state >/dev/null 2>&1; then
    "${SUDO[@]}" firewall-cmd --permanent --add-service=http >/dev/null 2>&1 || true
    "${SUDO[@]}" firewall-cmd --permanent --add-service=https >/dev/null 2>&1 || true
    "${SUDO[@]}" firewall-cmd --reload >/dev/null 2>&1 || true
    log_ok "В firewalld открыты http/https."
  fi

  echo "  Запрос SSL-сертификата Let's Encrypt для ${DOMAIN_NAME}..."
  CERTBOT_ARGS=(--nginx -d "$DOMAIN_NAME" --non-interactive --agree-tos --redirect)
  if [ -n "$CERT_EMAIL" ]; then
    CERTBOT_ARGS+=(-m "$CERT_EMAIL")
  else
    CERTBOT_ARGS+=(--register-unsafely-without-email)
  fi

  CERT_OK=0
  for attempt in 1 2; do
    if "${SUDO[@]}" certbot "${CERTBOT_ARGS[@]}"; then
      CERT_OK=1
      break
    fi
    if [ "$attempt" -lt 2 ]; then
      log_warn "Первая попытка выпуска сертификата не удалась. Повтор через 10 секунд (DNS/порты 80,443)..."
      sleep 10
    fi
  done

  if [ "$CERT_OK" = "1" ]; then
    FINAL_URL="https://${DOMAIN_NAME}"
    log_ok "HTTPS (порт 443) настроен для ${FINAL_URL}."
    # Проверяем цепочку Nginx -> приложение локально через SNI (без зависимости от DNS).
    if curl -fsS --max-time 10 --resolve "${DOMAIN_NAME}:443:127.0.0.1" \
      "https://${DOMAIN_NAME}/api/health" >/dev/null 2>&1; then
      log_ok "Проверка HTTPS и проксирования через Nginx пройдена."
    else
      log_warn "Сертификат выпущен, но локальная проверка https://${DOMAIN_NAME}/api/health не прошла."
      log_warn "Проверьте: sudo nginx -t && sudo systemctl status nginx && curl -I https://${DOMAIN_NAME}"
    fi
  else
    FINAL_URL="http://${DOMAIN_NAME}"
    log_warn "Nginx настроен, но выпустить SSL-сертификат не удалось."
    log_warn "Проверьте, что A-запись ${DOMAIN_NAME} указывает на этот сервер и открыты порты 80/443,"
    log_warn "после чего выполните: sudo certbot --nginx -d ${DOMAIN_NAME}"
  fi
fi

# При повторном запуске без --domain не сбрасываем уже настроенный HTTPS:
# определяем адрес по существующему конфигу Nginx.
if [ -z "$FINAL_URL" ] && [ "$(read_env_value "$ENV_FILE" BIND_HOST)" = "127.0.0.1" ]; then
  EXISTING_NGINX_CONF="${NGINX_SITES_AVAILABLE_DIR}/interactive-calendar"
  if [ -f "$EXISTING_NGINX_CONF" ]; then
    DETECTED_DOMAIN="$(awk '/^[[:space:]]*server_name/ {print $2; exit}' "$EXISTING_NGINX_CONF" | tr -d ';' || true)"
    if [ -n "$DETECTED_DOMAIN" ]; then
      if "${SUDO[@]}" test -f "${LETSENCRYPT_LIVE_DIR}/${DETECTED_DOMAIN}/fullchain.pem" 2>/dev/null; then
        FINAL_URL="https://${DETECTED_DOMAIN}"
      else
        FINAL_URL="http://${DETECTED_DOMAIN}"
      fi
    fi
  fi
fi

if [ -z "$FINAL_URL" ]; then
  SERVER_IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")"
  FINAL_URL="http://${SERVER_IP}:${APP_PORT}"
  if [ "$(read_env_value "$ENV_FILE" BIND_HOST)" = "127.0.0.1" ]; then
    log_warn "Порт приложения привязан к 127.0.0.1, но конфиг Nginx не найден."
    log_warn "Запустите установщик с --domain <ваш домен>, чтобы настроить внешний доступ."
  fi
fi

# ------------------------------------------------------------------------------
# Итог
# ------------------------------------------------------------------------------
echo ""
log_info "================================================================="
log_info "${BOLD}✓ Установка успешно завершена!${NC}"
echo ""
echo -e "  Адрес приложения:   ${BOLD}${CYAN}${FINAL_URL}${NC}"
echo -e "  Папка проекта:      ${BOLD}${INSTALL_DIR}${NC}"
echo -e "  База данных SQLite: ${BOLD}${INSTALL_DIR}/data/calendar_db.sqlite${NC}"
echo -e "  Журнал установки:   ${BOLD}${INSTALL_LOG_FILE}${NC}"
echo ""
echo "  Первые шаги: откройте адрес выше и зарегистрируйте аккаунт (например, учителя),"
echo "  затем создайте класс и передайте ученикам 6-символьный код приглашения."
echo ""
echo "  Полезные команды:"
echo -e "    • Просмотр логов:   ${YELLOW}cd ${INSTALL_DIR} && ${COMPOSE[*]} logs -f${NC}"
echo -e "    • Перезапуск:       ${YELLOW}cd ${INSTALL_DIR} && ${COMPOSE[*]} restart${NC}"
echo -e "    • Обновление:       ${YELLOW}bash ${INSTALL_DIR}/install.sh --yes${NC}"
echo -e "    • Настройки почты:  ${YELLOW}nano ${INSTALL_DIR}/.env && cd ${INSTALL_DIR} && ${COMPOSE[*]} up -d${NC}"
echo -e "    • Резервная копия:  ${YELLOW}bash ${INSTALL_DIR}/backup.sh${NC}"
if [ -n "$DOMAIN_NAME" ] && [ "$SKIP_SSL" != "1" ]; then
  echo -e "    • Проверка SSL:     ${YELLOW}sudo certbot renew --dry-run${NC}"
fi
echo ""
if [[ "$FINAL_URL" == http://* ]]; then
  log_warn "Приложение опубликовано по HTTP. Для HTTPS запустите установщик снова с --domain <ваш домен>."
fi
log_info "================================================================="
