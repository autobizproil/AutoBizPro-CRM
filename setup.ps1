# CRM SaaS — One-time setup script
# Run from project root: .\setup.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== CRM SaaS Setup ===" -ForegroundColor Cyan

# ── Backend ──────────────────────────────────────────────────────────────────
Write-Host "`n[1/4] Creating Laravel project..." -ForegroundColor Yellow
composer create-project laravel/laravel backend --prefer-dist

Set-Location backend

Write-Host "`n[2/4] Installing backend packages..." -ForegroundColor Yellow
composer require laravel/sanctum

php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider" --force

php artisan key:generate

# Queue tables
php artisan queue:table
php artisan migrate

Write-Host "`n[3/4] Copying app files..." -ForegroundColor Yellow
# App files are already in place (written by Claude)

Set-Location ..

# ── Frontend ─────────────────────────────────────────────────────────────────
Write-Host "`n[4/4] Creating React frontend..." -ForegroundColor Yellow
npm create vite@latest frontend -- --template react

Set-Location frontend
npm install
npm install @tanstack/react-query react-router-dom axios
npm install -D tailwindcss @tailwindcss/vite tailwindcss-rtl

Set-Location ..

Write-Host "`n=== Setup complete! ===" -ForegroundColor Green
Write-Host "Backend:  cd backend && php artisan serve" -ForegroundColor White
Write-Host "Frontend: cd frontend && npm run dev" -ForegroundColor White
