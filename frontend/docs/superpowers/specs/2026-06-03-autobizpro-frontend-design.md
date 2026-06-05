# AutoBizPro Frontend — Design Spec
**Date:** 2026-06-03  
**Stack:** Vite + React 19 + Tailwind v4 + React Query v5  
**Backend:** Laravel (port 8000), Sanctum auth, multi-tenant via X-Tenant header  

---

## Design Source of Truth

**`D:\design_handoff_autobizpro\`** — 10 HTML screen prototypes + design system. This is the visual reference for every pixel.

| File | Screen |
|------|--------|
| `Dashboard.html` | לוח בקרה — KPI cards, 6 charts |
| `Leads Table.html` | לידים — table, drawer, bulk bar |
| `Pipeline Kanban.html` | פייפליין — drag kanban |
| `Contacts.html` | אנשי קשר — grid + list |
| `Customers.html` | לקוחות — health bar table |
| `Reports.html` | דוחות — charts + leaderboard |
| `Automations.html` | אוטומציות — flow cards |
| `Forms.html` | טפסים — preview cards |
| `Landing Pages.html` | דפי נחיתה — browser thumbnail cards |
| `Design System.html` | מערכת עיצוב — color/type/component guide |

**Rule:** for every component, check the corresponding HTML file for exact CSS class names before writing anything. `tokens.css` and `app.css` from the handoff are already at `src/tokens.css` and `src/app.css` — these are the single source of truth for all styling. Never use Tailwind utility classes for design — use the app.css classes.

**Key CSS classes from handoff (already in app.css):**
- Layout: `.app`, `.sidebar`, `.brand`, `.brand__logo`, `.brand__name`, `.nav-group`, `.nav-group__label`, `.nav-item`, `.nav-item--active`, `.nav-item__badge`, `.sidebar__foot`, `.user-chip`, `.avatar`, `.main`, `.header`, `.header__title`, `.header__sub`, `.header__actions`, `.header__spacer`, `.content`
- Dashboard: `.dash-grid`, `.kpi-row`, `.chart-row-2`, `.chart-row-eq`, `.seg`, `.seg button.on`, `.kpi`, `.kpi__top`, `.kpi__icon`, `.kpi__label`, `.kpi__value`, `.kpi__foot`, `.delta`, `.delta--up`, `.delta--down`, `.card__head`, `.card__title`, `.legend-inline`
- Components: `.btn`, `.btn--primary`, `.btn--accent`, `.btn--ghost`, `.btn--icon`, `.btn--sm`, `.input`, `.select`, `.textarea`, `.card`, `.pill`, `.badge`, `.tbl`, `.toolbar`, `.chip`, `.drawer`, `.modal`, `.timeline`

---

## Context

The frontend had full functionality working against a real backend (port 8000). Design system work (tokens.css + app.css) was applied but inadvertently touched JS logic — hooks, AuthContext, Layout, SettingsPage — causing functional regressions. This spec defines a clean approach: CSS handles design, JS handles only genuine bug fixes.

**Invariant throughout all phases:** never change logic in LeadsPage, PipelinePage, ContactsPage, AutomationsPage, FormsPage, LeadPanel. These are untouched and working.

---

## Phase 1 — Bug Fixes + Clean Design Layer

### Hooks (useLeads, usePipeline, useContacts)

Current state: mock data added as `.catch()` fallback — correct pattern, but has bugs causing flicker and double-render.

Fix: ensure `placeholderData` and `queryFn` return same shape. Mock fallback stays (backend may be off during dev).

```js
// correct pattern — keep this
queryFn: () => api.list(filters)
  .then(r => r.data.data)
  .catch(() => mockData)
```

No logic changes beyond shape consistency.

### AuthContext

Dev fallback (mock user when `/auth/me` fails) stays — needed when backend is off. Must not block real login when backend is on: the fallback only fires on network error, so it's already correct. No change needed.

### Layout (sidebar + header)

Keep new design (sidebar, brand lockup, user chip, settings gear). Fix only:
- Settings gear navigates to `/settings` ✓ (already done)
- No duplicate settings link in nav ✓ (already done)
- All nav items route correctly ✓

### DashboardPage

Keep Recharts charts. Fix:
- Data comes from `useDashboard` hook (API) with mock fallback
- No hardcoded data inside component
- Segmented control (שבוע/חודש/שנה) passes filter to hook

### SettingsPage — all tabs with controlled fields

Every input uses `value` + `onChange` (controlled). All buttons functional:

| Tab | Fields | Save action |
|-----|--------|-------------|
| כללי | name, field, phone, email, address, lang, tz, currency | PUT /settings/tenant |
| מצבים | pipeline stages (add/edit/delete), lead statuses, sources | local state → PUT /settings/stages |
| משתמשים | CRUD users table | POST/PATCH/DELETE /users |
| אינטגרציות | toggle connected, webhook URL, API key copy | PUT /settings/integrations |
| WhatsApp | provider, api key, phone, display name | PUT /settings/tenant (existing) |
| התראות | toggles | PUT /settings/notifications |
| אבטחה | password change, 2FA toggle | POST /auth/password |

Logo upload: `<input type="file" accept="image/*">` hidden, triggered by button, preview shown locally, uploaded via `POST /settings/logo` multipart.

Toast feedback on every save action (already implemented).

### Design system files — keep as-is
- `src/tokens.css` — CSS custom properties, light + dark
- `src/app.css` — all component classes
- `src/index.css` — imports both

---

## Phase 2 — i18n: HE ↔ EN

**Library:** `react-i18next` + `i18next`  
**Languages:** Hebrew (default), English  
**Scope:** all UI strings — labels, buttons, headers, placeholders, error messages  
**Not translated:** customer data (names, emails, notes), API responses  

### File structure
```
src/i18n/
  index.js        — i18next init
  he.json         — Hebrew strings (default)
  en.json         — English strings
```

### Behavior
- Language stored in `localStorage` key `abp-lang`
- On change: `i18n.changeLanguage()` + `document.documentElement.setAttribute('dir', 'rtl'|'ltr')` + `document.documentElement.setAttribute('lang', 'he'|'en')`
- Toggle button in header (HE / EN pill)
- Heebo font works for both languages

### Usage in components
```jsx
const { t } = useTranslation()
<button>{t('leads.new')}</button>
```

### Key namespaces
- `common` — shared (save, cancel, delete, search…)
- `nav` — sidebar labels
- `leads` — leads page
- `pipeline` — pipeline
- `contacts` — contacts
- `settings` — settings tabs
- `dashboard` — dashboard labels

---

## Phase 3 — Make.com API Integration

**Architecture:** CRM is data layer. Make is automation engine. No Make SDK in CRM code.

### Direction A — CRM → Make (outgoing webhooks)

On these events, backend sends `POST` to configured webhook URL:
- Lead created
- Lead stage changed  
- Deal closed (stage = won/lost)
- Contact created

Webhook payload: `{ event, timestamp, tenant_id, data: { ...entity } }`

Frontend config (Settings → אינטגרציות tab):
- Webhook URL input (where Make scenario listens)
- Toggle per event type
- "Send test" button → `POST /api/settings/webhook/test`

### Direction B — Make → CRM (write-back)

Make calls CRM REST API using API Key header:
```
Authorization: Bearer {api_key}
X-Tenant: {tenant_subdomain}
```

Available endpoints Make can call:
- `POST /api/leads` — create lead
- `PATCH /api/leads/{id}` — update lead
- `PATCH /api/leads/{id}/stage` — move stage
- `POST /api/contacts` — create contact

These are the same endpoints the frontend already uses — no new backend work needed.

Frontend: Settings → API tab shows API key (copy button, regenerate button).

### What Make scenarios handle (not CRM's problem)
- Sending WhatsApp messages
- Sending email
- Writing to Google Sheets
- Slack notifications
- Any other external service

---

## Phase 4 — Cache + Offline

### React Query global config

```js
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:          5 * 60 * 1000,   // 5 min — don't refetch if fresh
      gcTime:             30 * 60 * 1000,  // 30 min — keep in memory
      retry:              1,               // one retry on failure
      refetchOnWindowFocus: false,         // don't hammer API on tab switch
    },
  },
})
```

### Persistence — survive page refresh

Package: `@tanstack/react-query-persist-client`  
Storage: `localStoragePersister`  
Max age: 24 hours  
Buster: app version string (invalidates cache on deploy)

```js
persistQueryClient({
  queryClient,
  persister: createSyncStoragePersister({ storage: localStorage }),
  maxAge: 24 * 60 * 60 * 1000,
  buster: APP_VERSION,
})
```

### Service Worker — offline support

Package: `vite-plugin-pwa` (Workbox under the hood)  
Strategy:
- App shell (JS, CSS, fonts, icons): `CacheFirst` — serve from cache, update in background
- API calls (`/api/*`): `NetworkFirst` — try network, fall back to cache
- Images: `CacheFirst` with 7-day expiry

When offline: app opens, shows last-cached data, mutations queue locally.

### Result
- Navigation between pages: instant (data in React Query cache)
- Page refresh: instant (data in localStorage)
- Backend down / offline: last-seen data shown, clear "offline" indicator
- Server load: ~80% fewer API calls after first load

---

## Implementation Order

```
Day 1:
  1.1  Fix hooks shape consistency (useLeads, usePipeline, useContacts)
  1.2  Fix SettingsPage — controlled fields, logo upload, save handlers
  1.3  Fix DashboardPage — data flow from hook

Day 2:
  2.1  Install + configure react-i18next
  2.2  Extract all strings → he.json + en.json
  2.3  Wire language toggle in header + dir/lang switching

Day 2-3:
  3.1  Settings → Integrations tab: webhook URL + event toggles
  3.2  Settings → API tab: key display, copy, regenerate
  3.3  Document Make scenario setup (README)

Day 3:
  4.1  Configure React Query global staleTime/gcTime
  4.2  Install + configure react-query-persist-client
  4.3  Install vite-plugin-pwa, configure Workbox strategies
```

---

## Files Changed Per Phase

| Phase | Files touched |
|-------|--------------|
| 1 | useLeads.js, usePipeline.js, useContacts.js, DashboardPage.jsx, SettingsPage.jsx |
| 2 | src/i18n/index.js (new), he.json (new), en.json (new), Layout.jsx, all pages (t() calls) |
| 3 | SettingsPage.jsx (integrations tab), api/settings.js (new) |
| 4 | main.jsx (QueryClient config + persist), vite.config.js (PWA plugin) |

**Never touched:** LeadsPage, PipelinePage, ContactsPage, AutomationsPage, FormsPage, LeadPanel, App.jsx routing
