# CRM SaaS למכירות — מסמך עיצוב

תאריך: 2026-05-29
Stack: Laravel 11 (API) + React 19 (SPA) + MySQL
לקוח ראשון: עוסק במכירת דלתות. ~5000 רשומות לייבא מ-Fireberry (CSV).

---

## 1. סקירה כללית

מערכת CRM מרובת-tenant (SaaS) לניהול מכירות. כל tenant = עסק. הליבה: ניהול לידים לאורך
תהליך מכירה, תקשורת (טלפון/WhatsApp), אוטומציות, וייבוא נתונים בקנה מידה.

תהליך מכירה של הלקוח הראשון (פשוט): ליד נכנס → שיחה → הצעת מחיר → סגירה/ביטול.
מקורות לידים: ידני, טפסי אתר, פייסבוק/גוגל (מעורב).

---

## 2. מודל נתונים

### ישות מרכזית: `leads`
כל רשומה זורמת בשלבי pipeline. שדה `pipeline_stage_id` קובע סטטוס.
"לקוח שקנה" = ליד שהגיע לשלב סגירה. אין הבחנה מלאכותית בין ליד ללקוח.

שדות: `id, tenant_id, name, phone, email, source, pipeline_stage_id, assigned_to,
notes, follow_up_at, custom_fields (json), created_at, updated_at, deleted_at (soft)`.

### `contacts` — אופציונלי per-tenant
נשאר בקוד. נשלט ע"י setting `contacts_mode`:
- `unified` (הלקוח הראשון) → contacts מושבת. הכל ליד.
- `separate` (tenants עתידיים) → לידים + לקוחות נפרדים.

### `activities` — לוג פעילות לכל ליד
טיפוסים: `call, whatsapp, email, note, stage_change, meeting`.
שדות: `id, tenant_id, entity_type, entity_id, user_id, type, body, created_at`.

### `tenant_settings` — טבלה חדשה
מפתח-ערך per-tenant:
- `contacts_mode`: unified | separate
- `labels`: JSON — תוויות מותאמות `{ "lead":"ליד", "stage":"שלב", "source":"מקור", ... }`
- `whatsapp_provider`: 360dialog | ultramsg | twilio | smartsend
- `whatsapp_credentials`: JSON
- `lead_sources`: מערך מקורות

### `import_jobs` — מעקב ייבוא
שדות: `id, tenant_id, user_id, filename, status (pending|processing|done|failed),
total_rows, imported, skipped, errors (json), field_mapping (json), created_at`.

### `whatsapp_templates` — תבניות הודעה
שדות: `id, tenant_id, name, body (עם placeholders {name} וכו'), created_at`.

קיימים כבר: `tenants, users, pipeline_stages, automations, automation_logs,
forms, form_submissions, roles_permissions`.

---

## 3. ייבוא מ-Fireberry (קריטי)

זרימה:
1. **העלאת CSV** → אחסון זמני, קריאת header.
2. **מיפוי שדות** — UI: כל עמודת CSV → שדה מערכת. auto-detect לפי שם עמודה.
3. **Preview** — 10 שורות ראשונות ממופות לאישור.
4. **Dedup** — לפי טלפון מנורמל (הסרת מקפים/רווחים/קידומת). כפילות → דלג או עדכן.
5. **Batch Job** — queue, 500 שורות לבאצ', progress. 5000 רשומות בלי timeout.
6. **דוח** — imported/skipped/errors + הורדת CSV שגיאות.

נורמליזציית טלפון: `phone_normalize()` — מסיר תווים לא-ספרתיים, מנרמל קידומת 0/972.

---

## 4. מסך לידים (הליבה)

### טבלה ראשית
עמודות: שם | טלפון (+כפתורי חיוג/WhatsApp) | שלב (dropdown מיידי) | מקור |
נציג | follow-up | תאריך.
- **inline edit** — לחיצה על תא עורכת במקום.
- **בחירה מרובה** (checkbox) → bulk: שנה שלב / הקצה נציג / מחק.
- pagination (25/50/100), חיפוש (שם/טלפון/אימייל), מיון.

### Sidebar סינון
שלב, נציג, מקור, טווח תאריכים. **Views שמורים** — מסננים מועדפים.

### Lead Panel (נפתח מצד)
- פרטים + עריכה inline.
- **ציר פעילויות (timeline)** — שיחות, WhatsApp, הערות, שינויי שלב, כרונולוגי.
- כפתורי פעולה: התקשר, WhatsApp, הוסף הערה, שנה שלב, קבע follow-up.

---

## 5. תוויות מותאמות (Labels)

מפת תוויות per-tenant ב-`tenant_settings.labels`.
- הלקוח משנה בהגדרות: "ליד"→"פנייה", "שלב"→"סטטוס מכירה" וכו'.
- Frontend טוען מפה דרך `LabelsContext`, כל UI משתמש ב-`t('lead')` במקום טקסט קשיח.
- ברירת מחדל עברית.
- כולל שמות שלבי pipeline (שם + צבע + סדר, ניתן לעריכה).

---

## 6. תקשורת

- **חיוג** — `tel:` link.
- **WhatsApp** — `wa.me/972...` + הודעת template מוכנה.
- **לוג ידני** — נציג מוסיף activity אחרי שיחה ("לא ענה"/"קבע פגישה").
- **תבניות WhatsApp** — per-tenant, placeholders `{name}`.
- **אימייל** — `mailto:` בלבד.

---

## 7. אוטומציות

- **טריגרים**: lead_created, stage_changed, follow_up_due, form_submitted.
- **תנאים**: שדה + operator (=, !=, contains, empty, not_empty) + ערך.
- **פעולות**: send_whatsapp (template), assign_to, change_stage, add_tag,
  create_activity, set_follow_up.
- Queue job אסינכרוני + `automation_logs`.

---

## 8. טפסים

- בונה טפסים: שדות טקסט/טלפון/אימייל/בחירה.
- URL ציבורי + embed (iframe).
- שליחה → ליד חדש אוטומטי + טריגר `form_submitted`.
- הגנת ספאם: honeypot + rate limit (10/דקה).

---

## 9. דשבורד

- כרטיסים: סה"כ לידים, חדשים היום, פתוחים, נסגרו החודש.
- **funnel** — ספירה לכל שלב + אחוז המרה.
- לידים לפי מקור (פאי).
- ביצועי נציגים (טבלה).
- לידים לטיפול (follow-up עבר).

---

## 10. משתמשים + הרשאות

- תפקידים: super_admin, admin, manager, agent (קיים).
- agent רואה רק לידים שלו (`scopeOwnedBy`).
- ניהול משתמשים, שיוך, הפעלה/השבתה.
- מטריצת הרשאות per-module/action (`roles_permissions`).

---

## 11. הגדרות

תוויות, שלבי pipeline, תבניות WhatsApp, WhatsApp provider,
`contacts_mode`, מקורות לידים.

---

## 12. ארכיטקטורה

- **Backend**: Controllers דקים → Services (לוגיקה) → Models. FormRequest לולידציה
  (הודעות עברית). Multi-tenancy: `HasTenantScope` trait (global scope auto-filter).
  Sanctum SPA (httpOnly cookies + CSRF).
- **Frontend**: React + TanStack Query (caching/mutations) + React Router.
  Context: Auth, Tenant, Labels. Hooks per-module. axios client עם X-Tenant + CSRF.
- **Queue**: database driver (Phase 1). jobs: import, automations.

---

## 13. סדר בנייה

1. **תשתית** — tenant_settings, labels context, תיקון מודל נתונים (unified leads).
2. **ייבוא** — CSV upload, mapping, dedup, batch job. (קריטי — דאטה קיים).
3. **מסך לידים** — טבלה, inline edit, lead panel, activities, bulk actions.
4. **תקשורת** — WhatsApp/חיוג buttons, templates, activity log.
5. **Pipeline** — Kanban drag&drop.
6. **דשבורד** — funnel, מקורות, ביצועים.
7. **אוטומציות** — triggers/conditions/actions UI.
8. **טפסים** — builder + public submit.
9. **הגדרות + הרשאות** — UI מלא.

---

## 14. מה לא נכלל (YAGNI — לעתיד)

- Facebook/Google Leads API ישיר (כרגע: ידני/טפסים).
- Billing/subscriptions ל-tenants.
- Email marketing campaigns.
- Custom fields builder מתקדם (כרגע: custom_fields JSON בלבד).
- אפליקציית מובייל.
- דוחות מתקדמים/export מורכב.
