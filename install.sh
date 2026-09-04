#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}=================================================${NC}"
echo -e "${CYAN}   Interactive Calendar Production Installer     ${NC}"
echo -e "${CYAN}=================================================${NC}"
echo ""

# Check for root/sudo
if [ "$EUID" -ne 0 ]; then
  echo -e "${YELLOW}Warning: It is recommended to run this script as root or with sudo.${NC}"
fi

# Dependency Checks
echo -e "${GREEN}[1/4] Checking dependencies...${NC}"
for cmd in git docker; do
  if ! command -v $cmd &> /dev/null; then
    echo -e "${RED}Error: $cmd is not installed. Please install it first.${NC}"
    exit 1
  fi
done

# Docker Compose check (either docker-compose or docker compose)
if ! command -v docker-compose &> /dev/null && ! (docker compose version &> /dev/null); then
    echo -e "${RED}Error: docker-compose is not installed. Please install it first.${NC}"
    exit 1
fi

# Ask for directory
read -p "$(echo -e ${YELLOW}"Enter installation directory [default: /opt/interactive-calendar]: "${NC})" INSTALL_DIR
INSTALL_DIR=${INSTALL_DIR:-/opt/interactive-calendar}

echo -e "${GREEN}[2/4] Cloning repository to $INSTALL_DIR...${NC}"
if [ -d "$INSTALL_DIR" ]; then
  echo -e "${YELLOW}Directory already exists. Pulling latest changes...${NC}"
  cd "$INSTALL_DIR"
  git pull
else
  git clone https://github.com/wisoqu/Interactive-calendar.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

echo -e "${GREEN}[3/4] Configuring Environment & SMTP...${NC}"
if [ ! -f .env ]; then
  cp .env.example .env
  
  echo -e "${CYAN}"
  echo "--- SMTP (Email) Configuration ---"
  echo "To allow users to reset their passwords, you need an SMTP server."
  echo "For Gmail, you MUST use an 'App Password', not your main account password."
  echo "Leave the 'SMTP Host' blank if you want to SKIP email setup."
  echo -e "${NC}"

  read -p "$(echo -e ${YELLOW}"SMTP Host (e.g., smtp.gmail.com) [Press Enter to skip]: "${NC})" smtp_host
  if [ -n "$smtp_host" ]; then
    read -p "$(echo -e ${YELLOW}"SMTP Port (e.g., 587 or 465): "${NC})" smtp_port
    read -p "$(echo -e ${YELLOW}"SMTP User (e.g., you@gmail.com): "${NC})" smtp_user
    read -p "$(echo -e ${YELLOW}"SMTP Password (App Password): "${NC})" smtp_pass
    read -p "$(echo -e ${YELLOW}"SMTP From (e.g., \"No Reply\" <noreply@example.com>): "${NC})" smtp_from
    
    # Safely replace env variables
    sed -i "s|^SMTP_HOST=.*|SMTP_HOST=\"$smtp_host\"|" .env
    sed -i "s|^SMTP_PORT=.*|SMTP_PORT=\"$smtp_port\"|" .env
    sed -i "s|^SMTP_USER=.*|SMTP_USER=\"$smtp_user\"|" .env
    sed -i "s|^SMTP_PASS=.*|SMTP_PASS=\"$smtp_pass\"|" .env
    sed -i "s|^SMTP_FROM=.*|SMTP_FROM=\"$smtp_from\"|" .env
    echo -e "${GREEN}SMTP configured successfully.${NC}"
  else
    echo -e "${YELLOW}Skipping SMTP setup. Password recovery emails will be disabled.${NC}"
  fi
else
  echo -e "${YELLOW}.env file already exists. Preserving current configuration.${NC}"
fi

echo -e "${GREEN}[4/4] Building and starting Docker containers...${NC}"
if command -v docker-compose &> /dev/null; then
  docker-compose up -d --build
else
  docker compose up -d --build
fi

echo -e "${CYAN}=================================================${NC}"
echo -e "${GREEN}Installation Complete!${NC}"
echo -e "Application is running on: ${CYAN}http://localhost:3000${NC}"
echo -e "To view logs, run: ${YELLOW}cd $INSTALL_DIR && docker compose logs -f${NC}"
echo -e "${CYAN}=================================================${NC}"

