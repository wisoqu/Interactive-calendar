#!/usr/bin/env bash
#
# Проверка install.sh без реального Docker/сервера и без обращения к GitHub.
#
# Подменяет docker, apt-get, systemctl, nginx, certbot, curl и getent заглушками,
# а исходный код берёт из временного локального git-зеркала этого репозитория.
# Проверяется, что установщик:
#   1) клонирует проект и собирает .env;
#   2) публикует приложение на 0.0.0.0:3000 без домена (TRUST_PROXY=0);
#   3) настраивает Nginx + Certbot при указанном домене и переводит BIND_HOST
#      на 127.0.0.1 с TRUST_PROXY=1;
#   4) сохраняет существующую конфигурацию при повторном запуске (update);
#   5) корректно проводит интерактивный диалог (домен, email, SMTP) через pty.
#
# Запуск: bash tests/install-sim.sh   (или npm run test:install)
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
pass=0
fail=0
trap 'if [ "$fail" -eq 0 ]; then rm -rf "$WORK"; fi' EXIT

BIN="$WORK/bin"
mkdir -p "$BIN" "$WORK/nginx-sites-available" "$WORK/nginx-sites-enabled" "$WORK/le"

check() {
  local desc="$1"
  shift
  if "$@"; then
    echo "  [PASS] $desc"
    pass=$((pass + 1))
  else
    echo "  [FAIL] $desc"
    fail=$((fail + 1))
  fi
}

# --- Mock binaries -----------------------------------------------------------
cat > "$BIN/sudo" <<'EOF'
#!/usr/bin/env bash
exec "$@"
EOF

cat > "$BIN/docker" <<'EOF'
#!/usr/bin/env bash
echo "docker $*" >> "$SIM_LOG/docker.log"
case "$1" in
  info) exit 0 ;;
  compose)
    case "$2" in
      version) echo "Docker Compose version v2.29.0"; exit 0 ;;
      up|restart|logs|down) exit 0 ;;
    esac
    exit 0
    ;;
esac
exit 0
EOF

cat > "$BIN/apt-get" <<'EOF'
#!/usr/bin/env bash
echo "apt-get $*" >> "$SIM_LOG/apt.log"
exit 0
EOF

cat > "$BIN/systemctl" <<'EOF'
#!/usr/bin/env bash
echo "systemctl $*" >> "$SIM_LOG/systemctl.log"
exit 0
EOF

cat > "$BIN/nginx" <<'EOF'
#!/usr/bin/env bash
echo "nginx $*" >> "$SIM_LOG/nginx.log"
exit 0
EOF

cat > "$BIN/certbot" <<'EOF'
#!/usr/bin/env bash
echo "certbot $*" >> "$SIM_LOG/certbot.log"
exit 0
EOF

cat > "$BIN/ufw" <<'EOF'
#!/usr/bin/env bash
echo "ufw $*" >> "$SIM_LOG/ufw.log"
echo "Status: inactive"
exit 0
EOF

cat > "$BIN/curl" <<'EOF'
#!/usr/bin/env bash
echo "curl $*" >> "$SIM_LOG/curl.log"
for arg in "$@"; do
  case "$arg" in
    *api.ipify.org*) echo "203.0.113.10"; exit 0 ;;
    *get.docker.com*) echo "#!/bin/sh"; exit 0 ;;
    *"/api/health"*) echo '{"status":"healthy","timestamp":"2026-01-01T00:00:00.000Z"}'; exit 0 ;;
  esac
done
exit 0
EOF

cat > "$BIN/getent" <<'EOF'
#!/usr/bin/env bash
if [ "$1" = "ahostsv4" ]; then
  echo "203.0.113.10  STREAM calendar.test"
  exit 0
fi
exec /usr/bin/getent "$@" 2>/dev/null || exit 2
EOF

chmod +x "$BIN"/*
export PATH="$BIN:$PATH"

# Локальное зеркало, чтобы не зависеть от сети и тестировать именно этот коммит.
git clone --quiet --bare "$REPO_ROOT" "$WORK/source.git"
git -C "$WORK/source.git" branch --force sim-source HEAD
SIM_REPO_URL="$WORK/source.git"
SIM_REF="sim-source"

run_installer() {
  local name="$1"
  shift
  SIM_LOG="$WORK" REPO_URL="$SIM_REPO_URL" INSTALL_LOG_FILE="$WORK/$name.log" \
  NGINX_SITES_AVAILABLE_DIR="$WORK/nginx-sites-available" \
  NGINX_SITES_ENABLED_DIR="$WORK/nginx-sites-enabled" \
  LETSENCRYPT_LIVE_DIR="$WORK/le" \
  HEALTH_WAIT_SECONDS=5 \
  bash "$REPO_ROOT/install.sh" --ref "$SIM_REF" "$@" > "$WORK/$name.out" 2>&1
}

report_installer_failure() {
  local name="$1"
  echo "  [FAIL] installer exited with an error ($name)"
  echo "  --- $name output (tail) ---"
  tail -50 "$WORK/$name.out" || true
  echo "  --- installer log (tail) ---"
  tail -50 "$WORK/$name.log" 2>/dev/null || true
  exit 1
}

echo "Installer simulation (no network, mocked docker/nginx/certbot)"
echo

# --- Scenario 1: domain + HTTPS ---------------------------------------------
echo "1. Fresh install with domain and HTTPS"
if ! run_installer s1 --yes --no-swap --dir "$WORK/app" \
  --domain calendar.test --email admin@calendar.test; then
  report_installer_failure s1
fi
APP="$WORK/app"
ENV_FILE="$APP/.env"
NGINX_CONF="$WORK/nginx-sites-available/interactive-calendar"

check "project cloned (package.json + server.ts)" test -f "$APP/package.json" -a -f "$APP/server.ts"
check "data directory created" test -d "$APP/data"
check ".env is mode 600" test "$(stat -c '%a' "$ENV_FILE")" = "600"
check ".env sets NODE_ENV=production" grep -qx "NODE_ENV=production" "$ENV_FILE"
check ".env sets PORT=3000" grep -qx "PORT=3000" "$ENV_FILE"
check ".env publishes via loopback after HTTPS" grep -qx "BIND_HOST=127.0.0.1" "$ENV_FILE"
check ".env trusts Nginx proxy" grep -qx "TRUST_PROXY=1" "$ENV_FILE"
check ".env keeps container listen address 0.0.0.0" grep -qx "LISTEN_HOST=0.0.0.0" "$ENV_FILE"
check "SMTP left disabled when skipped" grep -qx "SMTP_HOST=" "$ENV_FILE"
check "nginx site config created" test -f "$NGINX_CONF"
check "nginx proxies to the app port" grep -q "proxy_pass http://127.0.0.1:3000;" "$NGINX_CONF"
check "nginx server_name matches domain" grep -q "server_name calendar.test;" "$NGINX_CONF"
check "nginx site enabled" test -L "$WORK/nginx-sites-enabled/interactive-calendar"
check "compose build+up was invoked" grep -q "compose up -d --build" "$WORK/docker.log"
check "compose up -d re-run after BIND_HOST change" grep -qx "docker compose up -d" "$WORK/docker.log"
check "certbot requested for the domain" grep -q "certbot --nginx -d calendar.test" "$WORK/certbot.log"
check "certbot received the email" grep -q -- "-m admin@calendar.test" "$WORK/certbot.log"
check "health endpoint polled" grep -q "/api/health/db" "$WORK/curl.log"
check "final URL reported as HTTPS" grep -q "https://calendar.test" "$WORK/s1.out"

# --- Scenario 2: no domain, direct IP access --------------------------------
echo "2. Fresh install without domain (direct IP:3000)"
NGINX_CALLS_BEFORE="$(wc -l < "$WORK/nginx.log" 2>/dev/null || echo 0)"
CERTBOT_CALLS_BEFORE="$(wc -l < "$WORK/certbot.log" 2>/dev/null || echo 0)"
if ! run_installer s2 --yes --no-swap --dir "$WORK/app2"; then
  report_installer_failure s2
fi
APP2="$WORK/app2"
ENV2="$APP2/.env"
check ".env publishes on all interfaces" grep -qx "BIND_HOST=0.0.0.0" "$ENV2"
check ".env does not trust forwarded headers" grep -qx "TRUST_PROXY=0" "$ENV2"
check "no additional nginx invocation in IP mode" test "$(wc -l < "$WORK/nginx.log" 2>/dev/null || echo 0)" = "$NGINX_CALLS_BEFORE"
check "no additional certbot invocation in IP mode" test "$(wc -l < "$WORK/certbot.log" 2>/dev/null || echo 0)" = "$CERTBOT_CALLS_BEFORE"
check "final URL uses server IP and port" grep -q "http://203.0.113.10:3000" "$WORK/s2.out"

# --- Scenario 3: re-run (update) keeps the HTTPS profile -------------------
echo "3. Re-run on an already configured HTTPS installation"
mkdir -p "$WORK/le/calendar.test"
: > "$WORK/le/calendar.test/fullchain.pem"
if ! run_installer s3 --yes --no-swap --dir "$APP"; then
  report_installer_failure s3
fi
check "BIND_HOST stays on loopback" grep -qx "BIND_HOST=127.0.0.1" "$ENV_FILE"
check "TRUST_PROXY stays enabled" grep -qx "TRUST_PROXY=1" "$ENV_FILE"
check "existing SMTP settings preserved" grep -qx "SMTP_HOST=" "$ENV_FILE"
check "existing HTTPS URL detected on update" grep -q "https://calendar.test" "$WORK/s3.out"
check "update path used the existing git repository" grep -q "Обновляем код" "$WORK/s3.out"

# --- Scenario 4: interactive dialog through a real pty -----------------------
echo "4. Interactive Q&A dialog (pty)"
if command -v script >/dev/null 2>&1; then
  DIALOG_CMD="env SIM_LOG='$WORK' REPO_URL='$SIM_REPO_URL' INSTALL_LOG_FILE='$WORK/s4.log' NGINX_SITES_AVAILABLE_DIR='$WORK/nginx-sites-available' NGINX_SITES_ENABLED_DIR='$WORK/nginx-sites-enabled' LETSENCRYPT_LIVE_DIR='$WORK/le' HEALTH_WAIT_SECONDS=5 bash '$REPO_ROOT/install.sh' --ref '$SIM_REF' --no-swap"
  printf '%s\n' "$WORK/app4" "smtp.gmail.com" "587" "school@example.org" "app-password" "" \
    "calendar.test" "admin@calendar.test" \
    | script -qec "$DIALOG_CMD" /dev/null > "$WORK/s4.pty" 2>&1 \
    || report_installer_failure s4
  ENV4="$WORK/app4/.env"
  check "dialog: SMTP host saved" grep -qx "SMTP_HOST=smtp.gmail.com" "$ENV4"
  check "dialog: SMTP port saved" grep -qx "SMTP_PORT=587" "$ENV4"
  check "dialog: SMTP login saved" grep -qx "SMTP_USER=school@example.org" "$ENV4"
  check "dialog: SMTP password saved" grep -qx "SMTP_PASS=app-password" "$ENV4"
  check "dialog: secure=false for STARTTLS port 587" grep -qx "SMTP_SECURE=false" "$ENV4"
  check "dialog: sender defaulted from SMTP login" grep -q 'SMTP_FROM="Школьный календарь <school@example.org>"' "$ENV4"
  check "dialog: HTTPS profile enabled" grep -qx "BIND_HOST=127.0.0.1" "$ENV4"
  check "dialog: proxy trust enabled" grep -qx "TRUST_PROXY=1" "$ENV4"
  check "dialog: certbot got the prompted email" grep -q -- "-m admin@calendar.test" "$WORK/certbot.log"
  check "dialog: no literal ANSI escapes in output" bash -c "! grep -q '\\\\033' '$WORK/s4.log'"
else
  echo "  [SKIP] util-linux 'script' not available — interactive dialog not tested"
fi

# --- Scenario 5: consistent backup -----------------------------------------
echo "5. Backup script"
: > "$WORK/app4/data/calendar_db.sqlite"
if ! SIM_LOG="$WORK" bash "$REPO_ROOT/backup.sh" "$WORK/app4" "$WORK/backup.tgz" > "$WORK/s5.out" 2>&1; then
  echo "  [FAIL] backup script exited with an error"
  tail -30 "$WORK/s5.out" || true
  exit 1
fi
check "backup archive created" test -s "$WORK/backup.tgz"
tar tzf "$WORK/backup.tgz" > "$WORK/backup.list"
check "backup contains SQLite data" grep -qx "data/calendar_db.sqlite" "$WORK/backup.list"
check "backup contains .env" grep -qx "\.env" "$WORK/backup.list"
check "backup archive is mode 600" test "$(stat -c '%a' "$WORK/backup.tgz")" = "600"
LAST_TWO="$(tail -2 "$WORK/docker.log" | tr '\n' '|')"
check "backup stops and restarts the app" grep -q "docker compose stop|docker compose start|" <<< "$LAST_TWO"

if SIM_LOG="$WORK" bash "$REPO_ROOT/backup.sh" "$WORK/app4" /proc/forbidden/backup.tgz > "$WORK/s5fail.out" 2>&1; then
  check "failed backup returns non-zero" false
else
  check "failed backup returns non-zero" true
fi
LAST_TWO="$(tail -2 "$WORK/docker.log" | tr '\n' '|')"
check "app restarted after failed backup" grep -q "docker compose stop|docker compose start|" <<< "$LAST_TWO"

# --- Scenario 6: SMTP password containing Compose-special characters --------
echo "6. SMTP password with \$ and # characters"
if ! run_installer s6 --yes --no-swap --no-ssl --dir "$WORK/app6" \
  --smtp-host smtp.example.org --smtp-port 465 \
  --smtp-user mailer@example.org --smtp-pass 'p@$$w0rd#1'; then
  report_installer_failure s6
fi
ENV6="$WORK/app6/.env"
check "password with \$ is single-quoted for Compose" grep -Fqx "SMTP_PASS='p@\$\$w0rd#1'" "$ENV6"
check "SMTP_SECURE=true inferred for port 465" grep -qx "SMTP_SECURE=true" "$ENV6"
check "SMTP settings survive the quoting" grep -qx "SMTP_USER=mailer@example.org" "$ENV6"
check "no accidental shell expansion in log" bash -c "! grep -q 'SMTP_PASS=p@[0-9]' '$ENV6'"

echo
if [ "$fail" -eq 0 ]; then
  echo "ALL $pass INSTALLER SIMULATION CHECKS PASSED"
  exit 0
fi
echo "$fail INSTALLER SIMULATION CHECK(S) FAILED (outputs in $WORK)"
echo "--- s1 output (tail) ---"
tail -40 "$WORK/s1.out" || true
echo "--- s2 output (tail) ---"
tail -30 "$WORK/s2.out" || true
echo "--- s3 output (tail) ---"
tail -30 "$WORK/s3.out" || true
exit 1
