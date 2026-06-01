# CRM SaaS — הפעלה

## דרישות מקדימות
- PHP 8.2+
- Composer
- Node.js 18+
- MySQL

---

## התקנה ראשונית (פעם אחת)

### 1. Backend
```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
```

ערוך את `backend/.env`:
```
DB_DATABASE=crm_saas
DB_USERNAME=root
DB_PASSWORD=     # הסיסמה שלך
```

```bash
php artisan migrate
php artisan queue:table
php artisan migrate
```

### 2. Frontend
```bash
cd frontend
npm install
```

---

## הפעלה יומיומית

**טרמינל 1 — Backend:**
```bash
cd backend
php artisan serve
```
→ רץ על http://localhost:8000

**טרמינל 2 — Queue Worker (אוטומציות):**
```bash
cd backend
php artisan queue:work
```

**טרמינל 3 — Frontend:**
```bash
cd frontend
npm run dev
```
→ רץ על http://localhost:5173

---

## טסטים

**Backend:**
```bash
cd backend
php artisan test
```

**Frontend:**
```bash
cd frontend
npm test
```

---

## מבנה תיקיות

```
backend/
├── app/Http/Controllers/   ← API endpoints
├── app/Models/             ← Eloquent models
├── app/Services/           ← AutomationEngine, NotificationService
├── app/Jobs/               ← RunAutomationJob
├── app/Http/Middleware/    ← TenantMiddleware, CheckPermission
├── database/migrations/    ← כל הטבלאות
└── routes/api.php          ← כל ה-routes

frontend/
├── src/api/                ← axios clients per module
├── src/context/            ← AuthContext, TenantContext
├── src/hooks/              ← useLeads, useContacts, usePipeline...
└── src/pages/              ← כל הדפים
```

---

## Multi-tenancy

כל tenant מזוהה לפי subdomain:
```
acme.crm.co.il  →  tenant "acme"
beta.crm.co.il  →  tenant "beta"
```

בפיתוח מקומי — הוסף ל-`hosts` file:
```
127.0.0.1  acme.localhost
```
ואז גש ל: `http://acme.localhost:5173`
