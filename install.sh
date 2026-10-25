#!/usr/bin/env bash
set -euo pipefail

# Цветовое оформление вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

REPO_URL="https://github.com/wisoqu/Interactive-calendar.git"
DEFAULT_INSTALL_DIR="/opt/interactive-calendar"
APP_PORT="3000"

# Безопасное чтение ввода из терминала (работает при запуске через bash <(curl ...) и curl | bash)
prompt_input() {
  local prompt_text="$1"
  local var_name="$2"
  local default_val="${3:-}"
  local input_val=""

  if [ -r /dev/tty ]; then
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

  if [ -r /dev/tty ]; then
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

escape_env_val() {
  local val="$1"
  val="${val//\\/\\\\}"
  val="${val//\"/\\\"}"
  printf '"%s"' "$val"
}

echo -e "${CYAN}=================================================================${NC}"
echo -e "${BOLD}${CYAN}   Установщик «Интерактивный школьный календарь» (Production)   ${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""

# Определение прав root / sudo
SUDO=""
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
    echo -e "${YELLOW}Примечание: скрипт запущен не от root — для системных команд будет использован sudo.${NC}"
  else
    echo -e "${RED}Ошибка: запустите скрипт от имени root или установите пакет sudo.${NC}"
    exit 1
  fi
fi

# ------------------------------------------------------------------------------
# Шаг 1. Проверка оперативной памяти (ОЗУ) и настройка SWAP для бюджетных VPS
# ------------------------------------------------------------------------------
echo -e "${GREEN}[1/6] Проверка ресурсов сервера...${NC}"
if [ -f /proc/meminfo ]; then
  TOTAL_RAM_MB=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)
  TOTAL_SWAP_MB=$(awk '/SwapTotal/ {printf "%d", $2/1024}' /proc/meminfo)
  echo -e "  Обнаружено ОЗУ: ${BOLD}${TOTAL_RAM_MB} МБ${NC} | SWAP (подкачка): ${BOLD}${TOTAL_SWAP_MB} МБ${NC}"

  if [ "$TOTAL_RAM_MB" -lt 1800 ] && [ "$TOTAL_SWAP_MB" -lt 512 ]; then
    echo -e "${YELLOW}  На сервере менее 2 ГБ ОЗУ и не настроен SWAP.${NC}"
    echo -e "  Для быстрой и безошибочной сборки проекта на недорогом VPS рекомендуется добавить 2 ГБ SWAP."
    prompt_input "${YELLOW}  [НЕОБЯЗАТЕЛЬНО] Создать файл подкачки SWAP (2 ГБ)? [Y/n]: ${NC}" CREATE_SWAP "Y"
    if [[ "$CREATE_SWAP" =~ ^[YyДд]$ ]]; then
      if [ ! -f /swapfile ]; then
        echo -e "  Создание /swapfile (2 ГБ)..."
        if $SUDO fallocate -l 2G /swapfile 2>/dev/null || $SUDO dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none; then
          $SUDO chmod 600 /swapfile
          if $SUDO mkswap /swapfile >/dev/null 2>&1 && $SUDO swapon /swapfile >/dev/null 2>&1; then
            if ! grep -q '/swapfile' /etc/fstab 2>/dev/null; then
              echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab >/dev/null
            fi
            echo -e "${GREEN}  ✓ Файл подкачки SWAP (2 ГБ) успешно подключен.${NC}"
          else
            $SUDO rm -f /swapfile || true
            echo -e "${YELLOW}  ! Виртуализация вашего хостинга не разрешает создание SWAP внутри контейнера. Продолжаем без него.${NC}"
          fi
        fi
      else
        echo -e "${YELLOW}  Файл /swapfile уже существует, пропускаем создание.${NC}"
      fi
    fi
  fi
fi
echo ""

# ------------------------------------------------------------------------------
# Шаг 2. Проверка и установка зависимостей (Git, Curl, Docker, Docker Compose)
# ------------------------------------------------------------------------------
echo -e "${GREEN}[2/6] Проверка системных пакетов (Git, Docker, Docker Compose)...${NC}"

if ! command -v git >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    echo -e "  Устанавливаем базовые утилиты (git, curl, ca-certificates)..."
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq git curl ca-certificates
  else
    echo -e "${RED}Ошибка: установите пакеты git и curl вручную и повторите запуск.${NC}"
    exit 1
  fi
fi

if ! command -v docker >/dev/null 2>&1; then
  echo -e "${YELLOW}  Docker не установлен на этом сервере.${NC}"
  prompt_input "${YELLOW}  [ОБЯЗАТЕЛЬНО] Установить Docker автоматически с официального сайта? [Y/n]: ${NC}" INSTALL_DOCKER "Y"
  if [[ "$INSTALL_DOCKER" =~ ^[YyДд]$ ]]; then
    curl -fsSL https://get.docker.com | $SUDO sh
    if command -v systemctl >/dev/null 2>&1; then
      $SUDO systemctl enable --now docker || true
    fi
    echo -e "${GREEN}  ✓ Docker успешно установлен.${NC}"
  else
    echo -e "${RED}Установка прервана: для работы приложения необходим Docker.${NC}"
    exit 1
  fi
fi

DOCKER_PREFIX=""
if ! docker info >/dev/null 2>&1; then
  DOCKER_PREFIX="$SUDO"
fi

COMPOSE_CMD=""
if $DOCKER_PREFIX docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="$DOCKER_PREFIX docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="$DOCKER_PREFIX docker-compose"
else
  if command -v apt-get >/dev/null 2>&1; then
    echo -e "  Устанавливаем плагин docker-compose-plugin..."
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq docker-compose-plugin
    COMPOSE_CMD="$DOCKER_PREFIX docker compose"
  else
    echo -e "${RED}Ошибка: плагин Docker Compose не найден. Установите docker-compose-plugin.${NC}"
    exit 1
  fi
fi
echo -e "${GREEN}  ✓ Все необходимые инструменты готовы.${NC}"
echo ""

# ------------------------------------------------------------------------------
# Шаг 3. Выбор папки и загрузка исходного кода с GitHub
# ------------------------------------------------------------------------------
echo -e "${GREEN}[3/6] Загрузка приложения...${NC}"
prompt_input "${YELLOW}  [ОБЯЗАТЕЛЬНО] Папка установки [Enter = ${DEFAULT_INSTALL_DIR}]: ${NC}" INSTALL_DIR "$DEFAULT_INSTALL_DIR"

if [ -d "$INSTALL_DIR/.git" ]; then
  echo -e "  Папка $INSTALL_DIR уже содержит репозиторий. Обновляем код..."
  $SUDO git -C "$INSTALL_DIR" pull --ff-only
elif [ -d "$INSTALL_DIR" ] && [ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
  echo -e "${YELLOW}  Папка $INSTALL_DIR уже существует и не пуста — используем текущие файлы.${NC}"
else
  $SUDO mkdir -p "$(dirname "$INSTALL_DIR")"
  $SUDO git clone "$REPO_URL" "$INSTALL_DIR"
fi

if [ -n "$SUDO" ]; then
  $SUDO chown -R "$(id -u):$(id -g)" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/data"
echo -e "${GREEN}  ✓ Исходный код подготовлен в ${INSTALL_DIR}.${NC}"
echo ""

# ------------------------------------------------------------------------------
# Шаг 4. Настройка .env и почты SMTP для восстановления паролей
# ------------------------------------------------------------------------------
echo -e "${GREEN}[4/6] Настройка параметров окружения и почты (SMTP)...${NC}"

CONFIGURE_ENV="Y"
if [ -f .env ]; then
  prompt_input "${YELLOW}  Файл .env уже существует. Перенастроить его заново? [y/N]: ${NC}" RECONFIG_ENV "N"
  if [[ ! "$RECONFIG_ENV" =~ ^[YyДд]$ ]]; then
    CONFIGURE_ENV="N"
    echo -e "  Сохранена текущая конфигурация .env."
  fi
fi

SMTP_USER_SAVED=""
if [ "$CONFIGURE_ENV" = "Y" ]; then
  echo -e "${CYAN}  --- Настройка отправки писем (восстановление пароля по email) ---${NC}"
  echo -e "  Этот шаг ${BOLD}НЕОБЯЗАТЕЛЕН${NC}: если нажать Enter, календарь будет полностью работать,"
  echo -e "  но отправка 6-значных кодов сброса пароля на почту будет отключена."
  echo -e "  Подсказка по популярным почтовым сервисам (нужен «Пароль приложения»!):"
  echo -e "    • Gmail:  SMTP Host = ${BOLD}smtp.gmail.com${NC},  Port = ${BOLD}587${NC}"
  echo -e "    • Яндекс: SMTP Host = ${BOLD}smtp.yandex.ru${NC},  Port = ${BOLD}465${NC}"
  echo -e "    • Mail.ru: SMTP Host = ${BOLD}smtp.mail.ru${NC},    Port = ${BOLD}465${NC}"
  echo ""

  prompt_input "${YELLOW}  [НЕОБЯЗАТЕЛЬНО] SMTP Host (или нажмите Enter, чтобы пропустить): ${NC}" smtp_host ""

  if [ -n "$smtp_host" ]; then
    default_smtp_port="587"
    if [[ "$smtp_host" == *"yandex"* ]] || [[ "$smtp_host" == *"mail.ru"* ]]; then
      default_smtp_port="465"
    fi

    prompt_input "${YELLOW}  [ОБЯЗАТЕЛЬНО для почты] SMTP Port [Enter = ${default_smtp_port}]: ${NC}" smtp_port "$default_smtp_port"

    smtp_user=""
    while [ -z "$smtp_user" ]; do
      prompt_input "${YELLOW}  [ОБЯЗАТЕЛЬНО для почты] Логин почты (например, school42@gmail.com): ${NC}" smtp_user ""
    done
    SMTP_USER_SAVED="$smtp_user"

    smtp_pass=""
    while [ -z "$smtp_pass" ]; do
      prompt_secret "${YELLOW}  [ОБЯЗАТЕЛЬНО для почты] Пароль приложения SMTP (ввод скрыт): ${NC}" smtp_pass
    done

    default_from="Школьный календарь <${smtp_user}>"
    prompt_input "${YELLOW}  [НЕОБЯЗАТЕЛЬНО] Отправитель письма [Enter = ${default_from}]: ${NC}" smtp_from "$default_from"

    smtp_secure="false"
    if [ "$smtp_port" = "465" ]; then
      smtp_secure="true"
    fi

    {
      echo "NODE_ENV=production"
      echo "PORT=${APP_PORT}"
      echo "SQLITE_DB_PATH=/app/data/calendar_db.sqlite"
      echo "SMTP_HOST=$(escape_env_val "$smtp_host")"
      echo "SMTP_PORT=${smtp_port}"
      echo "SMTP_USER=$(escape_env_val "$smtp_user")"
      echo "SMTP_PASS=$(escape_env_val "$smtp_pass")"
      echo "SMTP_FROM=$(escape_env_val "$smtp_from")"
      echo "SMTP_SECURE=${smtp_secure}"
    } > .env
    chmod 600 .env
    echo -e "${GREEN}  ✓ Почта SMTP успешно настроена и сохранена в .env.${NC}"
  else
    {
      echo "NODE_ENV=production"
      echo "PORT=${APP_PORT}"
      echo "SQLITE_DB_PATH=/app/data/calendar_db.sqlite"
      echo "SMTP_HOST="
      echo "SMTP_PORT=587"
      echo "SMTP_USER="
      echo "SMTP_PASS="
      echo "SMTP_FROM=\"Школьный календарь <no-reply@example.com>\""
      echo "SMTP_SECURE=false"
    } > .env
    chmod 600 .env
    echo -e "${YELLOW}  Настройка почты пропущена (вы всегда сможете заполнить ${INSTALL_DIR}/.env позже).${NC}"
  fi
fi
echo ""

# ------------------------------------------------------------------------------
# Шаг 5. Сборка и запуск Docker-контейнера
# ------------------------------------------------------------------------------
echo -e "${GREEN}[5/6] Сборка и запуск контейнера приложения...${NC}"
$COMPOSE_CMD up -d --build

echo -n "  Ожидание запуска веб-сервера"
APP_READY="0"
for _ in $(seq 1 25); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
    APP_READY="1"
    break
  fi
  echo -n "."
  sleep 1
done
echo ""

if [ "$APP_READY" = "1" ]; then
  echo -e "${GREEN}  ✓ Сервер и база данных SQLite успешно запущены на порту ${APP_PORT}!${NC}"
else
  echo -e "${YELLOW}  ! Контейнер еще запускается. Проверить логи можно командой: cd ${INSTALL_DIR} && docker compose logs -f${NC}"
fi
echo ""

# ------------------------------------------------------------------------------
# Шаг 6. Необязательная настройка домена, Nginx и бесплатного HTTPS (порт 443)
# ------------------------------------------------------------------------------
echo -e "${GREEN}[6/6] Настройка домена и защищенного HTTPS-соединения (порт 443)...${NC}"
echo -e "  Если у вас есть домен, направленный A-записью на IP этого сервера,"
echo -e "  скрипт автоматически настроит Nginx и выпустит бесплатный SSL-сертификат Let's Encrypt."
prompt_input "${YELLOW}  [НЕОБЯЗАТЕЛЬНО] Введите ваш домен (или нажмите Enter для работы по IP:${APP_PORT}): ${NC}" DOMAIN_NAME ""

FINAL_URL=""
if [ -n "$DOMAIN_NAME" ]; then
  if command -v apt-get >/dev/null 2>&1; then
    prompt_input "${YELLOW}  [НЕОБЯЗАТЕЛЬНО] Email для уведомлений Let's Encrypt [Enter = ${SMTP_USER_SAVED:-пропустить}]: ${NC}" CERT_EMAIL "$SMTP_USER_SAVED"

    echo -e "  Установка Nginx и Certbot..."
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq nginx certbot python3-certbot-nginx

    NGINX_CONF="/etc/nginx/sites-available/interactive-calendar"
    $SUDO tee "$NGINX_CONF" >/dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
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
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

    $SUDO ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/interactive-calendar
    $SUDO nginx -t && $SUDO systemctl reload nginx

    if command -v ufw >/dev/null 2>&1 && $SUDO ufw status 2>/dev/null | grep -q "Status: active"; then
      $SUDO ufw allow 'Nginx Full' >/dev/null 2>&1 || true
    fi

    echo -e "  Запрос SSL-сертификата Let's Encrypt для ${DOMAIN_NAME}..."
    CERTBOT_ARGS=(--nginx -d "$DOMAIN_NAME" --non-interactive --agree-tos --redirect)
    if [ -n "$CERT_EMAIL" ]; then
      CERTBOT_ARGS+=(-m "$CERT_EMAIL")
    else
      CERTBOT_ARGS+=(--register-unsafely-without-email)
    fi

    if $SUDO certbot "${CERTBOT_ARGS[@]}"; then
      FINAL_URL="https://${DOMAIN_NAME}"
      echo -e "${GREEN}  ✓ HTTPS (порт 443) успешно настроен для ${FINAL_URL}!${NC}"
    else
      FINAL_URL="http://${DOMAIN_NAME}"
      echo -e "${YELLOW}  ! Nginx настроен, но выпустить SSL-сертификат сейчас не удалось.${NC}"
      echo -e "${YELLOW}    Убедитесь, что DNS A-запись домена ${DOMAIN_NAME} указывает на этот сервер и открыты порты 80/443,${NC}"
      echo -e "${YELLOW}    после чего выполните: sudo certbot --nginx -d ${DOMAIN_NAME}${NC}"
    fi
  else
    echo -e "${YELLOW}  Автонастройка Nginx поддерживается на системах с apt (Ubuntu/Debian). Руководство есть в README.md.${NC}"
  fi
fi

if [ -z "$FINAL_URL" ]; then
  SERVER_IP=$(curl -fsS --max-time 4 https://api.ipify.org 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
  FINAL_URL="http://${SERVER_IP}:${APP_PORT}"
fi

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${BOLD}${GREEN}✓ Установка успешно завершена!${NC}"
echo -e ""
echo -e "  Адрес приложения:   ${BOLD}${CYAN}${FINAL_URL}${NC}"
echo -e "  Папка проекта:      ${BOLD}${INSTALL_DIR}${NC}"
echo -e "  База данных SQLite: ${BOLD}${INSTALL_DIR}/data/calendar_db.sqlite${NC}"
echo -e ""
echo -e "  Полезные команды:"
echo -e "    • Просмотр логов:   ${YELLOW}cd ${INSTALL_DIR} && docker compose logs -f${NC}"
echo -e "    • Перезапуск:       ${YELLOW}cd ${INSTALL_DIR} && docker compose restart${NC}"
echo -e "    • Настройки почты:  ${YELLOW}nano ${INSTALL_DIR}/.env && cd ${INSTALL_DIR} && docker compose up -d${NC}"
echo -e "${CYAN}=================================================================${NC}"
