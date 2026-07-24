#!/usr/bin/env bash
# ============================================================================
# AutoBizPro CRM — fresh Ubuntu VPS setup (Oracle Cloud Always Free tier)
# Target: Ubuntu 22.04 or 24.04, PHP 8.2, Laravel 12, MySQL, Nginx, Supervisor
#
# Run as a user with sudo (NOT as root directly — Oracle's default "ubuntu"
# user is fine). Read through once before running; a few values need editing
# (marked EDIT ME below) before you run this for real.
# ============================================================================
set -euo pipefail

# ---- EDIT ME ---------------------------------------------------------------
DOMAIN="your-domain.com"          # or your VPS public IP if no domain yet
DB_NAME="crm_saas"
DB_USER="crm_app"
DB_PASS="CHANGE_ME_STRONG_PASSWORD"
APP_DIR="/var/www/crm"
APP_USER="www-data"               # nginx/php-fpm run as this user
GIT_REPO=""                        # e.g. git@github.com:you/repo.git — leave blank to skip clone (upload manually instead)
# -----------------------------------------------------------------------------

echo "== 1/9: System update =="
sudo apt update && sudo apt upgrade -y

echo "== 2/9: Base tools =="
sudo apt install -y software-properties-common curl git unzip ufw

echo "== 3/9: PHP 8.2 + extensions Laravel needs =="
sudo add-apt-repository -y ppa:ondrej/php
sudo apt update
sudo apt install -y php8.2-fpm php8.2-cli php8.2-mysql php8.2-mbstring \
  php8.2-xml php8.2-curl php8.2-zip php8.2-gd php8.2-bcmath php8.2-intl \
  php8.2-opcache php8.2-readline

echo "== 4/9: MySQL server =="
sudo apt install -y mysql-server
sudo systemctl enable --now mysql

# Create the app database + a dedicated (non-root) DB user — never run the
# app as root@mysql in production.
sudo mysql <<SQL
CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
echo "   -> Run 'sudo mysql_secure_installation' afterward to lock down the root account, remove test DB/anon users."

echo "== 5/9: Nginx =="
sudo apt install -y nginx
sudo systemctl enable --now nginx

echo "== 6/9: Composer =="
curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer
composer --version

echo "== 7/9: Node.js (for the frontend build) =="
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version && npm --version

echo "== 8/9: Supervisor (keeps the queue worker alive) =="
sudo apt install -y supervisor
sudo systemctl enable --now supervisor

echo "== 9/9: App directory + permissions =="
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER":"$APP_USER" "$APP_DIR"

if [ -n "$GIT_REPO" ]; then
  git clone "$GIT_REPO" "$APP_DIR"
else
  echo "   -> GIT_REPO not set: upload your code to $APP_DIR yourself (scp/rsync), then re-run from the 'composer install' step below."
fi

echo ""
echo "============================================================"
echo "Base packages installed. Remaining steps (run manually — they"
echo "need your actual code/.env in place first):"
echo "============================================================"
cat <<'EOF'

# --- Backend setup (run from $APP_DIR/backend) ---
cd $APP_DIR/backend
composer install --no-dev --optimize-autoloader
cp .env.example .env          # then edit .env: DB creds, APP_URL, APP_ENV=production, APP_DEBUG=false
php artisan key:generate
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Laravel needs these two dirs writable by the web server user:
sudo chown -R www-data:www-data storage bootstrap/cache
sudo chmod -R 775 storage bootstrap/cache

# --- Frontend build (run from $APP_DIR/frontend) ---
cd $APP_DIR/frontend
npm install
npm run build
# Point Nginx's frontend root at frontend/dist (built static files), or serve
# it via a separate Nginx server block / CDN — see nginx config below.

EOF
echo "See nginx-crm.conf and supervisor-crm-worker.conf (written alongside this script) for the web server and queue worker configs."
