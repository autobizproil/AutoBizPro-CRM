# Deploying AutoBizPro CRM to the Oracle Cloud VPS

Three files here:

1. **`oracle-vps-setup.sh`** — installs everything (Nginx, PHP 8.2-FPM, MySQL, Composer, Node, Supervisor), creates the DB, sets up the app directory. Edit the `EDIT ME` block at the top first (domain, DB password, app dir, optionally your git repo URL).
2. **`nginx-crm.conf`** — the site config. Copy to `/etc/nginx/sites-available/crm`, symlink into `sites-enabled`, edit `server_name`.
3. **`supervisor-crm-worker.conf`** — keeps `queue:work` running forever, auto-restarts on crash/reboot. Copy to `/etc/supervisor/conf.d/`.

## Order of operations

```bash
# 1. On the fresh VPS, as the ubuntu/oracle default user:
scp oracle-vps-setup.sh nginx-crm.conf supervisor-crm-worker.conf ubuntu@<vps-ip>:~/
ssh ubuntu@<vps-ip>
chmod +x oracle-vps-setup.sh
./oracle-vps-setup.sh
```

```bash
# 2. Upload your actual code (from your machine, not the VPS):
rsync -avz --exclude node_modules --exclude vendor --exclude .git \
  "D:/new auto/" ubuntu@<vps-ip>:/var/www/crm/
```

```bash
# 3. Back on the VPS — backend
cd /var/www/crm/backend
composer install --no-dev --optimize-autoloader
cp .env.example .env
nano .env    # see "Critical .env changes" below — do not skip this
php artisan key:generate
php artisan migrate --force
php artisan config:cache && php artisan route:cache && php artisan view:cache
sudo chown -R www-data:www-data storage bootstrap/cache
sudo chmod -R 775 storage bootstrap/cache
```

```bash
# 4. Frontend build
cd /var/www/crm/frontend
npm install
npm run build
```

```bash
# 5. Wire up Nginx + Supervisor
sudo cp ~/nginx-crm.conf /etc/nginx/sites-available/crm
sudo ln -s /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo cp ~/supervisor-crm-worker.conf /etc/supervisor/conf.d/crm-worker.conf
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl status crm-worker:*   # should show RUNNING
```

```bash
# 6. HTTPS (once your domain's DNS points at the VPS)
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Critical `.env` changes (do not deploy without these)

This exact class of bug already broke local dev once this session — a hardcoded
tenant/domain value meant every API call silently 404'd. In production, three
values must match your **real domain**, not `localhost`:

```
APP_ENV=production
APP_DEBUG=false
APP_URL=https://your-domain.com

DB_HOST=127.0.0.1
DB_DATABASE=crm_saas
DB_USERNAME=crm_app        # the dedicated user the setup script created, not root
DB_PASSWORD=<the DB_PASS you set in the script>

SANCTUM_STATEFUL_DOMAINS=your-domain.com
SESSION_DOMAIN=your-domain.com
SESSION_SECURE_COOKIE=true          # must be true once you're on HTTPS

CORS_ALLOWED_ORIGINS=https://your-domain.com
QUEUE_CONNECTION=database
```

If you're serving the frontend from a *different* subdomain/origin than the
API (instead of the same-origin Nginx setup in `nginx-crm.conf`), also add
that origin to `CORS_ALLOWED_ORIGINS` and `SANCTUM_STATEFUL_DOMAINS`, and the
frontend's `X-Tenant` header logic (`frontend/src/api/client.js`) needs the
subdomain to actually resolve to a real tenant row in the `tenants` table —
same mechanism that broke on `localhost` earlier, now needs your real
subdomain instead.

## Verifying it actually worked

```bash
sudo supervisorctl status crm-worker:*      # RUNNING, not FATAL/STOPPED
curl -I https://your-domain.com             # 200
curl -I https://your-domain.com/api/auth/me # 401 (expected — not logged in; 500 means something's wrong)
sudo tail -f /var/www/crm/backend/storage/logs/laravel.log   # watch for errors while you click around
sudo tail -f /var/www/crm/backend/storage/logs/worker.log    # confirm queue jobs process (test a CSV import)
```
