# AutoBizPro Frontend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all functional regressions from the design pass, add HE↔EN i18n, wire Make.com API integration, and add React Query persistence + PWA offline support.

**Architecture:** Four sequential phases — (1) fix broken hooks/pages with design-only CSS from `D:\design_handoff_autobizpro\`, (2) add react-i18next on top of fixed code, (3) add Make.com webhook settings, (4) configure React Query persist + Workbox service worker. Pages that were never touched (LeadsPage, PipelinePage, ContactsPage, AutomationsPage, FormsPage, LeadPanel) are **never modified**.

**Tech Stack:** Vite 5, React 19, React Router 7, React Query 5, Tailwind v4, react-i18next, @tanstack/react-query-persist-client, vite-plugin-pwa

**Design source of truth:** `D:\design_handoff_autobizpro\` — match every class name and structure exactly from the HTML files. All CSS lives in `src/tokens.css` and `src/app.css` (already present). Never use raw Tailwind utilities for design.

---

## Files Modified / Created

| File | Action | Phase |
|------|--------|-------|
| `src/hooks/useLeads.js` | Fix mock shape | 1 |
| `src/hooks/usePipeline.js` | Fix mock shape | 1 |
| `src/hooks/useContacts.js` | Fix mock shape | 1 |
| `src/hooks/useDashboard.js` | Create | 1 |
| `src/api/settings.js` | Create | 1, 3 |
| `src/pages/dashboard/DashboardPage.jsx` | Fix data flow | 1 |
| `src/pages/settings/SettingsPage.jsx` | Fix logo upload + tabs | 1 |
| `src/components/ui/Layout.jsx` | Add lang toggle | 2 |
| `src/i18n/index.js` | Create | 2 |
| `src/i18n/he.json` | Create | 2 |
| `src/i18n/en.json` | Create | 2 |
| `src/main.jsx` | i18n provider + QC config + persist | 2, 4 |
| `vite.config.js` | PWA plugin | 4 |
| `package.json` | New deps | 2, 4 |

**Never touch:** `LeadsPage.jsx`, `PipelinePage.jsx`, `ContactsPage.jsx`, `AutomationsPage.jsx`, `FormsPage.jsx`, `LeadPanel.jsx`, `App.jsx`, `src/tokens.css`, `src/app.css`

---

## Phase 1 — Bug Fixes + Design Layer

### Task 1: Fix hook data shapes

**Problem:** `useLeads` mock catch returns `Lead[]` but real API returns `{ data: Lead[] }`. The `select` normalizes it but causes a double-render flicker. `useContacts` same issue. `usePipeline` is fine.

**Files:**
- Modify: `src/hooks/useLeads.js`
- Modify: `src/hooks/useContacts.js`

- [ ] **Step 1.1: Fix useLeads mock shape**

Replace `src/hooks/useLeads.js` entirely:

```js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { leadsApi } from '../api/leads'
import { MOCK_LEADS } from '../api/mockData'

function filterMockLeads(filters) {
  let results = [...MOCK_LEADS]
  if (filters.search) {
    const q = filters.search.toLowerCase()
    results = results.filter(l =>
      l.name.toLowerCase().includes(q) ||
      l.phone?.includes(q) ||
      l.email?.toLowerCase().includes(q)
    )
  }
  if (filters.status) results = results.filter(l => l.status === filters.status)
  if (filters.assigned_to === 'null') results = results.filter(l => !l.assigned_user)
  return results
}

const MOCK_SHAPE = (filters) => ({ data: filterMockLeads(filters) })

export function useLeads(filters = {}) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: () => leadsApi.list(filters)
      .then(r => r.data.data)
      .catch(() => MOCK_SHAPE(filters)),
    placeholderData: MOCK_SHAPE(filters),
  })
}

export function useLead(id) {
  return useQuery({
    queryKey: ['leads', id],
    queryFn: () => leadsApi.get(id)
      .then(r => r.data.data)
      .catch(() => MOCK_LEADS.find(l => l.id === id) || null),
    enabled: !!id,
  })
}

export function useCreateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => leadsApi.create(data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useUpdateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => leadsApi.update(id, data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useDeleteLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => leadsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useChangeLeadStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, stageId }) => leadsApi.changeStage(leadId, stageId).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}
```

- [ ] **Step 1.2: Fix useContacts mock shape**

Replace `src/hooks/useContacts.js` entirely:

```js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactsApi } from '../api/contacts'
import { MOCK_CONTACTS } from '../api/mockData'

function filterMockContacts(filters) {
  let results = [...MOCK_CONTACTS]
  if (filters.search) {
    const q = filters.search.toLowerCase()
    results = results.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q)
    )
  }
  return results
}

const MOCK_SHAPE = (filters) => ({ data: filterMockContacts(filters) })

export function useContacts(filters = {}) {
  return useQuery({
    queryKey: ['contacts', filters],
    queryFn: () => contactsApi.list(filters)
      .then(r => r.data.data)
      .catch(() => MOCK_SHAPE(filters)),
    placeholderData: MOCK_SHAPE(filters),
  })
}

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => contactsApi.create(data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}

export function useUpdateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => contactsApi.update(id, data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => contactsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}
```

- [ ] **Step 1.3: Verify dev server has no console errors**

Open `http://localhost:5173/leads` — table should show 14 mock leads, no red console errors.
Open `http://localhost:5173/contacts` — should show 6 mock contacts.

- [ ] **Step 1.4: Commit**

```bash
git add src/hooks/useLeads.js src/hooks/useContacts.js
git commit -m "fix: normalize mock data shape in hooks to match API response"
```

---

### Task 2: Create useDashboard hook

**Files:**
- Create: `src/hooks/useDashboard.js`
- Modify: `src/api/mockData.js` (add MOCK_DASHBOARD_CHART)

- [ ] **Step 2.1: Add chart mock data to mockData.js**

Add at bottom of `src/api/mockData.js`:

```js
export const MOCK_DASHBOARD_CHART = {
  leads_by_month: [
    { name: 'ינו', value: 42 }, { name: 'פבר', value: 55 },
    { name: 'מרץ', value: 49 }, { name: 'אפר', value: 63 },
    { name: 'מאי', value: 58 }, { name: 'יונ', value: 71 },
    { name: 'יול', value: 66 }, { name: 'אוג', value: 84 },
  ],
  revenue_by_month: [
    { name: 'ינו', value: 120 }, { name: 'פבר', value: 210 },
    { name: 'מרץ', value: 340 }, { name: 'אפר', value: 430 },
    { name: 'מאי', value: 560 }, { name: 'יונ', value: 690 },
    { name: 'יול', value: 810 }, { name: 'אוג', value: 980 },
  ],
  leads_by_source: [
    { name: 'דף נחיתה', value: 64 }, { name: 'פייסבוק', value: 48 },
    { name: 'גוגל', value: 39 },     { name: 'הפניה', value: 27 },
    { name: 'שיחה נכנסת', value: 18 },
  ],
  reps: [
    { name: 'דנה', value: 84 }, { name: 'אבי', value: 72 },
    { name: 'מאיה', value: 65 }, { name: 'רון', value: 58 },
  ],
  leads_by_stage: [
    { name: 'ליד חדש', value: 42, color: '#2398c2' },
    { name: 'שיחת היכרות', value: 28, color: '#7e838b' },
    { name: 'הצעת מחיר', value: 19, color: '#66758f' },
    { name: 'ממתין לחתימה', value: 11, color: '#b0935f' },
    { name: 'נסגר בהצלחה', value: 28, color: '#1f9d57' },
  ],
  stats: {
    total_leads: 128, new_leads_delta: 18,
    open_quotes_value: '247,500', open_quotes_count: 34, quotes_delta: 12,
    close_rate: 32, close_rate_delta: 4,
    deals_won: 24, deals_won_delta: 9,
  },
}
```

- [ ] **Step 2.2: Create useDashboard hook**

Create `src/hooks/useDashboard.js`:

```js
import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../api/dashboard'
import { MOCK_DASHBOARD_CHART } from '../api/mockData'

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => dashboardApi.stats()
      .then(r => r.data.data)
      .catch(() => MOCK_DASHBOARD_CHART.stats),
    placeholderData: MOCK_DASHBOARD_CHART.stats,
  })
}

export function useDashboardChart(range) {
  return useQuery({
    queryKey: ['dashboard', 'chart', range],
    queryFn: () => dashboardApi.chartData(range)
      .then(r => r.data.data)
      .catch(() => MOCK_DASHBOARD_CHART),
    placeholderData: MOCK_DASHBOARD_CHART,
  })
}
```

- [ ] **Step 2.3: Update dashboardApi to accept range param**

Edit `src/api/dashboard.js`:

```js
import client from './client'

export const dashboardApi = {
  stats:     () => client.get('/dashboard/stats'),
  chartData: (range = 'year') => client.get('/dashboard/chart-data', { params: { range } }),
}
```

- [ ] **Step 2.4: Update DashboardPage to use hooks**

Replace the hardcoded const arrays at top of `src/pages/dashboard/DashboardPage.jsx` (lines 11–43) with hook calls:

```jsx
import { useState } from 'react'
import { useDashboardStats, useDashboardChart } from '../../hooks/useDashboard'
import {
  Users, DollarSign, Target, CheckCircle2, TrendingUp, TrendingDown, Plus,
  Phone, Send, CheckCheck,
} from 'lucide-react'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const activity = [
  { icon: CheckCheck, text: <>העסקה עם <b>אבי נחום</b> נסגרה בהצלחה — ₪22,000</>, time: 'לפני 24 דקות' },
  { icon: Phone,      text: <>שיחת היכרות תועדה עבור <b>מאיה לוי</b></>,         time: 'לפני שעה' },
  { icon: Send,       text: <>הצעת מחיר נשלחה ל<b>דנה בר</b></>,                 time: 'לפני 3 שעות' },
  { icon: Users,      text: <>5 לידים חדשים נכנסו מ<b>דף הנחיתה</b></>,          time: 'היום, 09:14' },
]

const DONUT_COLORS = ['#2398c2', '#7e838b', '#66758f', '#b0935f', '#1f9d57']

function Delta({ up, children }) {
  return (
    <span className={'delta ' + (up ? 'delta--up' : 'delta--down')}>
      {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
      {children}
    </span>
  )
}

function Kpi({ icon: Ico, tint, label, value, up, delta, note }) {
  return (
    <div className="card kpi">
      <div className="kpi__top">
        <span className="kpi__icon" style={tint}><Ico size={18} /></span>
        <span className="kpi__label">{label}</span>
      </div>
      <div className="kpi__value tnum">{value}</div>
      <div className="kpi__foot"><Delta up={up}>{delta}</Delta>{note}</div>
    </div>
  )
}

function CardHead({ title, sub, children }) {
  return (
    <div className="card__head" style={{ paddingBottom: 4, alignItems: 'flex-start' }}>
      <div>
        <div className="card__title">{title}</div>
        {sub && <div style={{ fontSize: 12.5, color: 'var(--text-subtle)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ flex: 1 }} />
      {children}
    </div>
  )
}

export default function DashboardPage() {
  const [range, setRange] = useState('שנה')
  const { data: stats } = useDashboardStats()
  const { data: charts } = useDashboardChart(range)

  const leadsData   = charts?.leads_by_month   ?? []
  const revenueData = charts?.revenue_by_month  ?? []
  const repData     = charts?.reps              ?? []
  const sourceData  = charts?.leads_by_source   ?? []
  const donutData   = charts?.leads_by_stage    ?? []

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div className="seg">
          {['שבוע', 'חודש', 'שנה'].map(r => (
            <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
        <button className="btn btn--accent"><Plus size={16} />צור ליד</button>
      </div>

      <div className="dash-grid kpi-row" style={{ marginBottom: 16 }}>
        <Kpi icon={Users}        tint={{ background: 'var(--brand-50)', color: 'var(--brand-600)' }}
          label="לידים חדשים החודש"    value={stats?.total_leads ?? 128}
          up delta={`${stats?.new_leads_delta ?? 18}%`} note="לעומת החודש שעבר" />
        <Kpi icon={DollarSign}   tint={{ background: 'var(--lime-100)', color: 'var(--lime-700)' }}
          label="הצעות מחיר פתוחות"   value={<>₪ {stats?.open_quotes_value ?? '247,500'}</>}
          up delta={`${stats?.quotes_delta ?? 12}%`} note={`${stats?.open_quotes_count ?? 34} הצעות`} />
        <Kpi icon={Target}       tint={{ background: 'var(--amber-50,#fffbeb)', color: 'var(--amber-600,#d97706)' }}
          label="שיעור סגירה"          value={`${stats?.close_rate ?? 32}%`}
          up={false} delta={`${stats?.close_rate_delta ?? 4}%`} note="ממוצע צוות" />
        <Kpi icon={CheckCircle2} tint={{ background: 'var(--green-50,#f0fdf4)', color: 'var(--green-600,#16a34a)' }}
          label="עסקאות שנסגרו"        value={stats?.deals_won ?? 24}
          up delta={`${stats?.deals_won_delta ?? 9}%`} note="הרבעון" />
      </div>

      <div className="dash-grid chart-row-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <CardHead title="מגמת לידים חדשים" sub="8 חודשים אחרונים" />
          <div className="card__body" style={{ paddingTop: 8 }}>
            <ResponsiveContainer width="100%" height={236}>
              <LineChart data={leadsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} orientation="right" axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
                <Line type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2.4}
                  dot={{ r: 3, fill: 'var(--surface)', stroke: 'var(--chart-1)', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <CardHead title="לידים לפי שלב" />
          <div className="card__body" style={{ paddingTop: 8 }}>
            <ResponsiveContainer width="100%" height={236}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={68} outerRadius={96}
                  dataKey="value" paddingAngle={2}>
                  {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="legend-inline" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
              {donutData.map((d, i) => (
                <span key={i} className="li">
                  <span className="sw" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                  {d.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="dash-grid chart-row-eq" style={{ marginBottom: 16 }}>
        <div className="card">
          <CardHead title="הכנסות מצטברות" sub="₪ אלפים" />
          <div className="card__body" style={{ paddingTop: 8 }}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} orientation="right" axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
                <Area type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2.4} fill="url(#grad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <CardHead title="ביצועים לפי נציג" />
          <div className="card__body" style={{ paddingTop: 8 }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={repData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
                <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="dash-grid chart-row-eq">
        <div className="card">
          <CardHead title="לידים לפי מקור" />
          <div className="card__body" style={{ paddingTop: 8 }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sourceData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
                <Bar dataKey="value" fill="var(--chart-2,#b1e239)" radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <CardHead title="פעילות אחרונה" />
          <div className="card__body">
            <div className="timeline">
              {activity.map((a, i) => (
                <div key={i} className="timeline__item">
                  <div className="timeline__dot"><a.icon size={13} /></div>
                  <div className="timeline__body">
                    <div style={{ fontSize: 13 }}>{a.text}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-subtle)', marginTop: 2 }}>{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2.5: Verify dashboard renders correctly**

Open `http://localhost:5173/dashboard`. Must see:
- 4 KPI cards in a row
- Segmented control שבוע/חודש/שנה — clicking each one works (no crash)
- 6 charts rendered with no black borders
- Activity timeline at bottom right

- [ ] **Step 2.6: Commit**

```bash
git add src/hooks/useDashboard.js src/api/dashboard.js src/api/mockData.js src/pages/dashboard/DashboardPage.jsx
git commit -m "feat: add useDashboard hook, wire DashboardPage to real data with mock fallback"
```

---

### Task 3: Create settings API

**Files:**
- Create: `src/api/settings.js`

- [ ] **Step 3.1: Create settings API module**

Create `src/api/settings.js`:

```js
import client from './client'

export const settingsApi = {
  getTenant:       ()     => client.get('/settings/tenant'),
  putTenant:       (data) => client.put('/settings/tenant', data),
  uploadLogo:      (file) => {
    const fd = new FormData()
    fd.append('logo', file)
    return client.post('/settings/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  getStages:       ()     => client.get('/settings/stages'),
  putStages:       (data) => client.put('/settings/stages', data),
  getUsers:        ()     => client.get('/users'),
  createUser:      (data) => client.post('/users', data),
  updateUser:      (id, data) => client.put(`/users/${id}`, data),
  getIntegrations: ()     => client.get('/settings/integrations'),
  putIntegrations: (data) => client.put('/settings/integrations', data),
  testWebhook:     ()     => client.post('/settings/webhook/test'),
  rotateApiKey:    ()     => client.post('/settings/api-key/rotate'),
  putNotifications:(data) => client.put('/settings/notifications', data),
  changePassword:  (data) => client.post('/auth/password', data),
}
```

- [ ] **Step 3.2: Commit**

```bash
git add src/api/settings.js
git commit -m "feat: add settings API module"
```

---

### Task 4: Fix SettingsPage — logo upload

**Files:**
- Modify: `src/pages/settings/SettingsPage.jsx`

The `GeneralTab` has a logo upload button with no actual file input. Fix it.

- [ ] **Step 4.1: Fix logo upload in GeneralTab**

Find the `GeneralTab` function in `src/pages/settings/SettingsPage.jsx`.

Replace the logo section:

```jsx
// At top of GeneralTab function, add:
const [logoPreview, setLogoPreview] = useState(null)
const fileRef = useRef(null)

const handleLogoFile = (e) => {
  const file = e.target.files[0]
  if (!file) return
  setLogoPreview(URL.createObjectURL(file))
  settingsApi.uploadLogo(file).catch(() => {})  // fire and forget, toast on success
  toast('לוגו הועלה')
}

// Replace the logo card JSX:
<SettingCard title="לוגו">
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    {logoPreview
      ? <img src={logoPreview} alt="לוגו" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'contain' }} />
      : <div style={{
          width: 64, height: 64, borderRadius: 12, background: 'var(--brand-100)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, fontWeight: 700, color: 'var(--brand-600)',
        }}>AB</div>
    }
    <div>
      <input
        ref={fileRef} type="file" accept="image/png,image/svg+xml,image/jpeg"
        style={{ display: 'none' }} onChange={handleLogoFile}
      />
      <button className="btn btn--outline" style={{ fontSize: 13 }} onClick={() => fileRef.current?.click()}>
        העלה לוגו
      </button>
      <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 4 }}>PNG, SVG — מקסימום 2MB</div>
    </div>
  </div>
</SettingCard>
```

Also add `import { useRef } from 'react'` and `import { settingsApi } from '../../api/settings'` at the top of the file.

- [ ] **Step 4.2: Verify logo upload UI**

Open `http://localhost:5173/settings` → כללי tab → click "העלה לוגו" → file picker opens → select an image → preview appears. Console may show API 404 (backend off) — that's fine.

- [ ] **Step 4.3: Commit**

```bash
git add src/pages/settings/SettingsPage.jsx
git commit -m "fix: wire logo file upload in settings general tab"
```

---

## Phase 2 — i18n: HE ↔ EN

### Task 5: Install i18n packages

- [ ] **Step 5.1: Install**

```bash
cd "D:\new auto\frontend"
npm install react-i18next i18next i18next-browser-languagedetector
```

Expected: packages added to node_modules, no peer-dep errors.

- [ ] **Step 5.2: Commit package.json**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-i18next dependencies"
```

---

### Task 6: Create i18n config + translation files

**Files:**
- Create: `src/i18n/index.js`
- Create: `src/i18n/he.json`
- Create: `src/i18n/en.json`

- [ ] **Step 6.1: Create src/i18n/index.js**

```js
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import he from './he.json'
import en from './en.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { he: { translation: he }, en: { translation: en } },
    fallbackLng: 'he',
    detection: { order: ['localStorage'], lookupLocalStorage: 'abp-lang', caches: ['localStorage'] },
    interpolation: { escapeValue: false },
  })

export default i18n
```

- [ ] **Step 6.2: Create src/i18n/he.json**

```json
{
  "nav": {
    "dashboard":   "לוחות בקרה",
    "leads":       "לידים",
    "pipeline":    "פייפליין",
    "contacts":    "אנשי קשר",
    "customers":   "לקוחות",
    "automations": "אוטומציות",
    "forms":       "טפסים",
    "landing":     "דפי נחיתה",
    "reports":     "דוחות",
    "groups": {
      "people": "אנשים",
      "tools":  "כלים"
    }
  },
  "header": {
    "notifications": "התראות",
    "darkMode":      "מצב כהה",
    "lightMode":     "מצב בהיר",
    "pages": {
      "dashboard":   "לוח בקרה",
      "leads":       "לידים",
      "pipeline":    "פייפליין",
      "contacts":    "אנשי קשר",
      "customers":   "לקוחות",
      "automations": "אוטומציות",
      "forms":       "טפסים",
      "landing":     "דפי נחיתה",
      "reports":     "דוחות",
      "settings":    "הגדרות"
    },
    "subs": {
      "dashboard": "סקירת מכירות · רבעון נוכחי"
    }
  },
  "common": {
    "save":       "שמור",
    "saveChanges":"שמור שינויים",
    "cancel":     "ביטול",
    "add":        "הוסף",
    "edit":       "ערוך",
    "delete":     "מחק",
    "search":     "חיפוש",
    "active":     "פעיל",
    "inactive":   "לא פעיל",
    "connected":  "מחובר",
    "connect":    "חבר",
    "loading":    "טוען...",
    "noData":     "אין נתונים"
  },
  "settings": {
    "tabs": {
      "general":       "כללי",
      "statuses":      "מצבים ושלבים",
      "users":         "משתמשים",
      "integrations":  "אינטגרציות",
      "whatsapp":      "WhatsApp",
      "notifications": "התראות",
      "security":      "אבטחה"
    },
    "general": {
      "title":       "פרטי העסק",
      "desc":        "מידע בסיסי על העסק שלך",
      "bizName":     "שם העסק",
      "field":       "תחום",
      "phone":       "טלפון",
      "email":       "אימייל",
      "address":     "כתובת",
      "locale":      "לוקליזציה",
      "localeDesc":  "שפה, אזור זמן ומטבע",
      "language":    "שפה",
      "timezone":    "אזור זמן",
      "currency":    "מטבע",
      "logo":        "לוגו",
      "uploadLogo":  "העלה לוגו",
      "logoHint":    "PNG, SVG — מקסימום 2MB"
    },
    "users": {
      "title":    "ניהול משתמשים",
      "count":    "{{count}} משתמשים רשומים",
      "addUser":  "הוסף משתמש",
      "cols": {
        "user":      "משתמש",
        "role":      "תפקיד",
        "status":    "סטטוס",
        "lastLogin": "כניסה אחרונה"
      },
      "roles": {
        "title": "תפקידים והרשאות",
        "desc":  "ניהול תפקידים ורמות גישה",
        "users": "{{count}} משתמשים"
      }
    },
    "integrations": {
      "title":    "חיבורים",
      "desc":     "שירותים חיצוניים המחוברים למערכת",
      "api":      "API",
      "apiDesc":  "ניהול מפתחות API",
      "copy":     "העתק",
      "newKey":   "חדש מפתח",
      "webhook":  "Webhook URL",
      "edit":     "ערוך",
      "makeWebhook": {
        "title": "Make.com Webhook",
        "desc":  "URL שמייק שולח אליו נתונים",
        "label": "Webhook URL",
        "placeholder": "https://hook.eu2.make.com/...",
        "test": "שלח בדיקה",
        "events": "אירועים שמפעילים",
        "leadCreated": "ליד נוצר",
        "leadStageChanged": "שלב ליד שונה",
        "dealClosed": "עסקה נסגרה",
        "contactCreated": "איש קשר נוצר"
      }
    },
    "whatsapp": {
      "title":    "הגדרות WhatsApp",
      "desc":     "חיבור לספק WhatsApp Business API",
      "provider": "ספק",
      "apiKey":   "API Key",
      "phone":    "מספר טלפון",
      "display":  "שם תצוגה",
      "tip":      "לאחר שמירת ההגדרות, שלח הודעת בדיקה כדי לוודא שהחיבור תקין.",
      "test":     "שלח הודעת בדיקה"
    },
    "notifications": {
      "title": "העדפות התראות",
      "desc":  "בחר אילו התראות לקבל",
      "save":  "שמור העדפות",
      "items": {
        "new_lead":       { "label": "ליד חדש",       "desc": "התראה כשנכנס ליד חדש למערכת" },
        "lead_assigned":  { "label": "הקצאת ליד",     "desc": "התראה כשליד מוקצה אליך" },
        "deal_closed":    { "label": "עסקה נסגרה",    "desc": "התראה כשעסקה נסגרת בהצלחה" },
        "task_reminder":  { "label": "תזכורת משימה",  "desc": "תזכורת לפני מועד יעד של משימה" },
        "daily_report":   { "label": "דוח יומי",      "desc": "סיכום יומי של פעילות המכירות" },
        "weekly_report":  { "label": "דוח שבועי",     "desc": "סיכום שבועי עם גרפים ומגמות" }
      }
    },
    "security": {
      "password":      "סיסמה",
      "passwordDesc":  "שינוי סיסמת הכניסה",
      "current":       "סיסמה נוכחית",
      "new":           "סיסמה חדשה",
      "confirm":       "אימות סיסמה",
      "update":        "עדכן סיסמה",
      "mismatch":      "הסיסמאות לא תואמות",
      "twofa":         "אימות דו-שלבי (2FA)",
      "twofaDesc":     "הגברת האבטחה עם אימות נוסף",
      "twofaOff":      "כרגע לא פעיל",
      "enable":        "הפעל",
      "loginHistory":  "היסטוריית כניסות",
      "loginDesc":     "כניסות אחרונות לחשבון"
    },
    "statuses": {
      "stages":      "שלבי פייפליין",
      "stagesDesc":  "ניהול השלבים בתהליך המכירה",
      "addStage":    "הוסף שלב",
      "stageName":   "שם השלב",
      "stageColor":  "צבע",
      "stageOrder":  "שלב {{n}}",
      "editStage":   "עריכת שלב",
      "editStatus":  "עריכת מצב",
      "statuses":    "מצבי ליד",
      "statusesDesc":"סטטוסים שמוצגים בטבלת הלידים",
      "sources":     "מקורות ליד",
      "sourcesDesc": "מאיפה מגיעים הלידים",
      "addSource":   "הוסף מקור חדש..."
    }
  },
  "dashboard": {
    "week": "שבוע",
    "month": "חודש",
    "year": "שנה",
    "createLead": "צור ליד",
    "kpi": {
      "newLeads":     "לידים חדשים החודש",
      "openQuotes":   "הצעות מחיר פתוחות",
      "closeRate":    "שיעור סגירה",
      "dealsWon":     "עסקאות שנסגרו"
    },
    "charts": {
      "leadsTrend":   "מגמת לידים חדשים",
      "leadsByStage": "לידים לפי שלב",
      "revenue":      "הכנסות מצטברות",
      "repPerf":      "ביצועים לפי נציג",
      "bySource":     "לידים לפי מקור",
      "activity":     "פעילות אחרונה"
    }
  },
  "toast": {
    "saved":           "שינויים נשמרו",
    "logoUploaded":    "לוגו הועלה",
    "stageAdded":      "שלב נוסף",
    "stageUpdated":    "שלב עודכן",
    "stageDeleted":    "שלב נמחק",
    "statusUpdated":   "מצב עודכן",
    "sourceAdded":     "מקור נוסף",
    "userAdded":       "משתמש נוסף",
    "userUpdated":     "משתמש עודכן",
    "statusToggled":   "סטטוס עודכן",
    "keyCopied":       "מפתח הועתק",
    "keyRotated":      "מפתח חדש נוצר",
    "webhookSaved":    "Webhook נשמר",
    "testSent":        "הודעת בדיקה נשלחה",
    "notifsSaved":     "העדפות התראות נשמרו",
    "passwordUpdated": "סיסמה עודכנה",
    "passwordMismatch":"הסיסמאות לא תואמות",
    "twoFaEnabled":    "2FA הופעל",
    "connected":       "{{name}} חובר",
    "disconnected":    "{{name}} נותק",
    "whatsappSaved":   "הגדרות WhatsApp נשמרו",
    "generalSaved":    "הגדרות כלליות נשמרו"
  }
}
```

- [ ] **Step 6.3: Create src/i18n/en.json**

```json
{
  "nav": {
    "dashboard":   "Dashboard",
    "leads":       "Leads",
    "pipeline":    "Pipeline",
    "contacts":    "Contacts",
    "customers":   "Customers",
    "automations": "Automations",
    "forms":       "Forms",
    "landing":     "Landing Pages",
    "reports":     "Reports",
    "groups": {
      "people": "People",
      "tools":  "Tools"
    }
  },
  "header": {
    "notifications": "Notifications",
    "darkMode":      "Dark mode",
    "lightMode":     "Light mode",
    "pages": {
      "dashboard":   "Dashboard",
      "leads":       "Leads",
      "pipeline":    "Pipeline",
      "contacts":    "Contacts",
      "customers":   "Customers",
      "automations": "Automations",
      "forms":       "Forms",
      "landing":     "Landing Pages",
      "reports":     "Reports",
      "settings":    "Settings"
    },
    "subs": {
      "dashboard": "Sales Overview · Current Quarter"
    }
  },
  "common": {
    "save":       "Save",
    "saveChanges":"Save Changes",
    "cancel":     "Cancel",
    "add":        "Add",
    "edit":       "Edit",
    "delete":     "Delete",
    "search":     "Search",
    "active":     "Active",
    "inactive":   "Inactive",
    "connected":  "Connected ✓",
    "connect":    "Connect",
    "loading":    "Loading...",
    "noData":     "No data"
  },
  "settings": {
    "tabs": {
      "general":       "General",
      "statuses":      "Statuses & Stages",
      "users":         "Users",
      "integrations":  "Integrations",
      "whatsapp":      "WhatsApp",
      "notifications": "Notifications",
      "security":      "Security"
    },
    "general": {
      "title":       "Business Details",
      "desc":        "Basic information about your business",
      "bizName":     "Business Name",
      "field":       "Industry",
      "phone":       "Phone",
      "email":       "Email",
      "address":     "Address",
      "locale":      "Localization",
      "localeDesc":  "Language, timezone and currency",
      "language":    "Language",
      "timezone":    "Timezone",
      "currency":    "Currency",
      "logo":        "Logo",
      "uploadLogo":  "Upload Logo",
      "logoHint":    "PNG, SVG — max 2MB"
    },
    "users": {
      "title":    "User Management",
      "count":    "{{count}} registered users",
      "addUser":  "Add User",
      "cols": {
        "user":      "User",
        "role":      "Role",
        "status":    "Status",
        "lastLogin": "Last Login"
      },
      "roles": {
        "title": "Roles & Permissions",
        "desc":  "Manage roles and access levels",
        "users": "{{count}} users"
      }
    },
    "integrations": {
      "title":    "Connections",
      "desc":     "External services connected to the system",
      "api":      "API",
      "apiDesc":  "Manage API keys",
      "copy":     "Copy",
      "newKey":   "Rotate Key",
      "webhook":  "Webhook URL",
      "edit":     "Edit",
      "makeWebhook": {
        "title": "Make.com Webhook",
        "desc":  "URL that Make sends data to",
        "label": "Webhook URL",
        "placeholder": "https://hook.eu2.make.com/...",
        "test": "Send Test",
        "events": "Triggering Events",
        "leadCreated": "Lead Created",
        "leadStageChanged": "Lead Stage Changed",
        "dealClosed": "Deal Closed",
        "contactCreated": "Contact Created"
      }
    },
    "whatsapp": {
      "title":    "WhatsApp Settings",
      "desc":     "Connect to WhatsApp Business API provider",
      "provider": "Provider",
      "apiKey":   "API Key",
      "phone":    "Phone Number",
      "display":  "Display Name",
      "tip":      "After saving, send a test message to verify the connection.",
      "test":     "Send Test Message"
    },
    "notifications": {
      "title": "Notification Preferences",
      "desc":  "Choose which notifications to receive",
      "save":  "Save Preferences",
      "items": {
        "new_lead":       { "label": "New Lead",        "desc": "Alert when a new lead enters the system" },
        "lead_assigned":  { "label": "Lead Assigned",   "desc": "Alert when a lead is assigned to you" },
        "deal_closed":    { "label": "Deal Closed",     "desc": "Alert when a deal closes successfully" },
        "task_reminder":  { "label": "Task Reminder",   "desc": "Reminder before a task due date" },
        "daily_report":   { "label": "Daily Report",    "desc": "Daily summary of sales activity" },
        "weekly_report":  { "label": "Weekly Report",   "desc": "Weekly summary with charts and trends" }
      }
    },
    "security": {
      "password":      "Password",
      "passwordDesc":  "Change your login password",
      "current":       "Current Password",
      "new":           "New Password",
      "confirm":       "Confirm Password",
      "update":        "Update Password",
      "mismatch":      "Passwords do not match",
      "twofa":         "Two-Factor Authentication (2FA)",
      "twofaDesc":     "Increase security with an additional verification step",
      "twofaOff":      "Currently inactive",
      "enable":        "Enable",
      "loginHistory":  "Login History",
      "loginDesc":     "Recent account logins"
    },
    "statuses": {
      "stages":      "Pipeline Stages",
      "stagesDesc":  "Manage stages in the sales process",
      "addStage":    "Add Stage",
      "stageName":   "Stage Name",
      "stageColor":  "Color",
      "stageOrder":  "Stage {{n}}",
      "editStage":   "Edit Stage",
      "editStatus":  "Edit Status",
      "statuses":    "Lead Statuses",
      "statusesDesc":"Statuses shown in the leads table",
      "sources":     "Lead Sources",
      "sourcesDesc": "Where leads come from",
      "addSource":   "Add new source..."
    }
  },
  "dashboard": {
    "week": "Week",
    "month": "Month",
    "year": "Year",
    "createLead": "Create Lead",
    "kpi": {
      "newLeads":     "New Leads This Month",
      "openQuotes":   "Open Quotes",
      "closeRate":    "Close Rate",
      "dealsWon":     "Deals Closed"
    },
    "charts": {
      "leadsTrend":   "New Leads Trend",
      "leadsByStage": "Leads by Stage",
      "revenue":      "Cumulative Revenue",
      "repPerf":      "Rep Performance",
      "bySource":     "Leads by Source",
      "activity":     "Recent Activity"
    }
  },
  "toast": {
    "saved":           "Changes saved",
    "logoUploaded":    "Logo uploaded",
    "stageAdded":      "Stage added",
    "stageUpdated":    "Stage updated",
    "stageDeleted":    "Stage deleted",
    "statusUpdated":   "Status updated",
    "sourceAdded":     "Source added",
    "userAdded":       "User added",
    "userUpdated":     "User updated",
    "statusToggled":   "Status updated",
    "keyCopied":       "Key copied",
    "keyRotated":      "New key created",
    "webhookSaved":    "Webhook saved",
    "testSent":        "Test message sent",
    "notifsSaved":     "Notification preferences saved",
    "passwordUpdated": "Password updated",
    "passwordMismatch":"Passwords do not match",
    "twoFaEnabled":    "2FA enabled",
    "connected":       "{{name}} connected",
    "disconnected":    "{{name}} disconnected",
    "whatsappSaved":   "WhatsApp settings saved",
    "generalSaved":    "General settings saved"
  }
}
```

- [ ] **Step 6.4: Commit**

```bash
git add src/i18n/
git commit -m "feat: add i18n translation files (he + en)"
```

---

### Task 7: Wire i18n into app + language toggle

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/components/ui/Layout.jsx`

- [ ] **Step 7.1: Add i18n import to main.jsx**

Replace `src/main.jsx`:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'
import './i18n/index.js'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            5 * 60 * 1000,
      gcTime:               30 * 60 * 1000,
      retry:                1,
      refetchOnWindowFocus: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
```

- [ ] **Step 7.2: Add language toggle to Layout.jsx**

At top of `src/components/ui/Layout.jsx`, add:

```jsx
import { useTranslation } from 'react-i18next'
```

Inside the `Layout` function, add:

```jsx
const { t, i18n } = useTranslation()

const toggleLang = () => {
  const next = i18n.language === 'he' ? 'en' : 'he'
  i18n.changeLanguage(next)
  document.documentElement.setAttribute('dir', next === 'he' ? 'rtl' : 'ltr')
  document.documentElement.setAttribute('lang', next)
}
```

In the `header__actions` div, add the language toggle button before the bell button:

```jsx
<button
  className="btn btn--ghost"
  onClick={toggleLang}
  style={{ fontSize: 12, fontWeight: 700, minWidth: 40, padding: '0 10px' }}
  title="שפה / Language"
>
  {i18n.language === 'he' ? 'EN' : 'HE'}
</button>
```

- [ ] **Step 7.3: Update Layout nav labels to use t()**

Replace the NAV array in Layout.jsx:

```jsx
const { t } = useTranslation()

const NAV = [
  { group: null, items: [
    { to: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { to: '/leads',     label: t('nav.leads'),     icon: Users, badge: '128' },
    { to: '/pipeline',  label: t('nav.pipeline'),  icon: GitBranch },
  ]},
  { group: t('nav.groups.people'), items: [
    { to: '/contacts',  label: t('nav.contacts'),  icon: BookUser },
    { to: '/customers', label: t('nav.customers'), icon: Building2 },
  ]},
  { group: t('nav.groups.tools'), items: [
    { to: '/automations', label: t('nav.automations'), icon: Zap },
    { to: '/forms',       label: t('nav.forms'),       icon: FileText },
    { to: '/landing',     label: t('nav.landing'),     icon: FileImage },
    { to: '/reports',     label: t('nav.reports'),     icon: BarChart3 },
  ]},
]
```

**Note:** `NAV` must be computed inside the component (not module-level constant) since it calls `t()` which is a hook result. Move the `const NAV = [...]` inside the `Layout` function body.

Also update PAGE_META to use `t()`:

```jsx
const PAGE_META = {
  '/dashboard':   { title: t('header.pages.dashboard'),   sub: t('header.subs.dashboard') },
  '/leads':       { title: t('header.pages.leads'),       sub: null },
  '/pipeline':    { title: t('header.pages.pipeline'),    sub: null },
  '/contacts':    { title: t('header.pages.contacts'),    sub: null },
  '/customers':   { title: t('header.pages.customers'),   sub: null },
  '/automations': { title: t('header.pages.automations'), sub: null },
  '/forms':       { title: t('header.pages.forms'),       sub: null },
  '/landing':     { title: t('header.pages.landing'),     sub: null },
  '/reports':     { title: t('header.pages.reports'),     sub: null },
  '/settings':    { title: t('header.pages.settings'),    sub: null },
}
```

Also move `PAGE_META` inside the `Layout` function.

Update the theme toggle button title:

```jsx
title={theme === 'dark' ? t('header.lightMode') : t('header.darkMode')}
```

- [ ] **Step 7.4: Verify language toggle**

Open `http://localhost:5173/dashboard`.
- Click the EN button in header → sidebar labels switch to English, page title switches to English, button shows HE
- Click HE → switches back to Hebrew
- Refresh page → language persists (localStorage `abp-lang`)

- [ ] **Step 7.5: Commit**

```bash
git add src/main.jsx src/components/ui/Layout.jsx
git commit -m "feat: add HE/EN language toggle with react-i18next"
```

---

### Task 8: Wire t() into Settings and Dashboard

**Files:**
- Modify: `src/pages/settings/SettingsPage.jsx`
- Modify: `src/pages/dashboard/DashboardPage.jsx`

- [ ] **Step 8.1: Add useTranslation to SettingsPage**

At top of `src/pages/settings/SettingsPage.jsx`, add:

```jsx
import { useTranslation } from 'react-i18next'
```

Add `const { t } = useTranslation()` at the top of each tab component function and the main `SettingsPage` function.

Replace hard-coded strings with `t()` calls using the keys from `he.json`:

```jsx
// TABS array — inside SettingsPage function:
const TABS = [
  { id: 'general',       label: t('settings.tabs.general'),       icon: Settings },
  { id: 'statuses',      label: t('settings.tabs.statuses'),      icon: Palette },
  { id: 'users',         label: t('settings.tabs.users'),         icon: Users },
  { id: 'integrations',  label: t('settings.tabs.integrations'),  icon: Link2 },
  { id: 'whatsapp',      label: t('settings.tabs.whatsapp'),      icon: MessageSquare },
  { id: 'notifications', label: t('settings.tabs.notifications'), icon: Bell },
  { id: 'security',      label: t('settings.tabs.security'),      icon: Shield },
]

// In GeneralTab, replace all Hebrew strings:
// "פרטי העסק"  → t('settings.general.title')
// "שם העסק"    → t('settings.general.bizName')
// "שמור שינויים" → t('common.saveChanges')
// etc.

// In toast calls, replace Hebrew strings with t() keys:
// toast('הגדרות כלליות נשמרו') → toast(t('toast.generalSaved'))
// toast('שלב עודכן')           → toast(t('toast.stageUpdated'))
// etc.
```

Apply `t()` throughout all tabs systematically. Every Hebrew string in the component uses a translation key from `he.json`.

- [ ] **Step 8.2: Add useTranslation to DashboardPage**

```jsx
import { useTranslation } from 'react-i18next'

// Inside DashboardPage function:
const { t } = useTranslation()

// Replace:
// ['שבוע','חודש','שנה']  → [t('dashboard.week'), t('dashboard.month'), t('dashboard.year')]
// 'צור ליד'              → t('dashboard.createLead')
// 'לידים חדשים החודש'    → t('dashboard.kpi.newLeads')
// 'הצעות מחיר פתוחות'   → t('dashboard.kpi.openQuotes')
// 'שיעור סגירה'          → t('dashboard.kpi.closeRate')
// 'עסקאות שנסגרו'        → t('dashboard.kpi.dealsWon')
// chart titles           → t('dashboard.charts.*')
```

- [ ] **Step 8.3: Verify full EN mode**

Click EN button. Check:
- Sidebar: all labels in English
- Header: page title "Dashboard", sub "Sales Overview · Current Quarter"
- Dashboard: KPI labels in English, chart titles in English, seg control "Week / Month / Year"
- Settings tabs: all in English
- Toast messages: in English when triggered

- [ ] **Step 8.4: Commit**

```bash
git add src/pages/settings/SettingsPage.jsx src/pages/dashboard/DashboardPage.jsx
git commit -m "feat: apply i18n t() throughout settings and dashboard"
```

---

## Phase 3 — Make.com Integration

### Task 9: Make.com webhook settings UI

The Integrations tab already shows services. Add a dedicated Make.com webhook section with URL input, event toggles, and test button.

**Files:**
- Modify: `src/pages/settings/SettingsPage.jsx` (IntegrationsTab function)

- [ ] **Step 9.1: Add Make.com section to IntegrationsTab**

Inside `IntegrationsTab`, add state for webhook config:

```jsx
const [webhookUrl, setWebhookUrl] = useState('')
const [webhookEvents, setWebhookEvents] = useState({
  lead_created:       true,
  lead_stage_changed: true,
  deal_closed:        true,
  contact_created:    false,
})
const toggleEvent = (key) => setWebhookEvents(p => ({ ...p, [key]: !p[key] }))

const saveWebhook = () => {
  settingsApi.putIntegrations({ webhook_url: webhookUrl, webhook_events: webhookEvents }).catch(() => {})
  toast(t('toast.webhookSaved'))
}

const testWebhook = () => {
  settingsApi.testWebhook().catch(() => {})
  toast(t('toast.testSent'))
}
```

Add this JSX block inside `IntegrationsTab`, after the existing connections grid:

```jsx
<SettingCard title={t('settings.integrations.makeWebhook.title')} desc={t('settings.integrations.makeWebhook.desc')}>
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div>
      <label className="input__label">{t('settings.integrations.makeWebhook.label')}</label>
      <input
        className="input"
        value={webhookUrl}
        onChange={e => setWebhookUrl(e.target.value)}
        placeholder={t('settings.integrations.makeWebhook.placeholder')}
        dir="ltr"
      />
    </div>

    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
        {t('settings.integrations.makeWebhook.events')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {Object.entries(webhookEvents).map(([key, val]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
            onClick={() => toggleEvent(key)}>
            {val
              ? <ToggleRight size={22} style={{ color: 'var(--brand-500)', flexShrink: 0 }} />
              : <ToggleLeft  size={22} style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />
            }
            <span style={{ fontSize: 13 }}>{t(`settings.integrations.makeWebhook.${key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`)}</span>
          </div>
        ))}
      </div>
    </div>

    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
      <button className="btn btn--primary" onClick={saveWebhook}>
        <Save size={14} /> {t('common.save')}
      </button>
      <button className="btn btn--outline" onClick={testWebhook} disabled={!webhookUrl}>
        {t('settings.integrations.makeWebhook.test')}
      </button>
    </div>
  </div>
</SettingCard>
```

- [ ] **Step 9.2: Verify Make section visible**

Open `http://localhost:5173/settings` → אינטגרציות tab → scroll down → Make.com Webhook card visible with URL input and toggles.

- [ ] **Step 9.3: Commit**

```bash
git add src/pages/settings/SettingsPage.jsx
git commit -m "feat: add Make.com webhook config to integrations settings"
```

---

## Phase 4 — Cache + Offline

### Task 10: React Query persistence

**Files:**
- Modify: `src/main.jsx`

- [ ] **Step 10.1: Install persist client**

```bash
cd "D:\new auto\frontend"
npm install @tanstack/react-query-persist-client @tanstack/query-sync-storage-persister
```

- [ ] **Step 10.2: Update main.jsx with persistence**

Replace `src/main.jsx`:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import App from './App'
import './index.css'
import './i18n/index.js'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            5 * 60 * 1000,
      gcTime:               30 * 60 * 1000,
      retry:                1,
      refetchOnWindowFocus: false,
    },
  },
})

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key:     'abp-query-cache',
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge:  24 * 60 * 60 * 1000,
        buster:  '1.0.0',
      }}
    >
      <App />
    </PersistQueryClientProvider>
  </React.StrictMode>
)
```

- [ ] **Step 10.3: Verify persistence**

1. Open `http://localhost:5173/leads` — wait for data to load (14 leads visible)
2. Open DevTools → Application → Local Storage → `abp-query-cache` key should exist with JSON data
3. Hard refresh (Ctrl+Shift+R) → leads appear instantly (no loading flicker)

- [ ] **Step 10.4: Commit**

```bash
git add src/main.jsx package.json package-lock.json
git commit -m "feat: add React Query localStorage persistence — data survives page refresh"
```

---

### Task 11: PWA + Service Worker

**Files:**
- Modify: `vite.config.js`
- Modify: `package.json`

- [ ] **Step 11.1: Install vite-plugin-pwa**

```bash
cd "D:\new auto\frontend"
npm install -D vite-plugin-pwa
```

- [ ] **Step 11.2: Update vite.config.js**

Replace `vite.config.js`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName:        'api-cache',
              networkTimeoutSeconds: 5,
              expiration:       { maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName:  'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name:             'AutoBiz Pro IL',
        short_name:       'AutoBizPro',
        description:      'CRM ניהול עסקי',
        theme_color:      '#2398c2',
        background_color: '#f4f6f8',
        display:          'standalone',
        dir:              'rtl',
        lang:             'he',
        icons: [
          { src: '/assets/autobizpro-logo.png', sizes: '256x256', type: 'image/png' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target:       'http://localhost:8000',
        changeOrigin: true,
        credentials:  true,
      },
      '/sanctum': {
        target:       'http://localhost:8000',
        changeOrigin: true,
        credentials:  true,
      },
    },
  },
})
```

- [ ] **Step 11.3: Build and verify PWA**

```bash
cd "D:\new auto\frontend"
npm run build
npm run preview
```

Open `http://localhost:4173` → DevTools → Application → Service Workers → should show registered SW.
In Network tab → throttle to Offline → refresh → app still loads with cached data.

- [ ] **Step 11.4: Commit**

```bash
git add vite.config.js package.json package-lock.json
git commit -m "feat: add PWA with Workbox — NetworkFirst for API, CacheFirst for assets"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| Fix hook data shapes | Task 1 |
| useDashboard hook | Task 2 |
| Settings API module | Task 3 |
| Logo upload | Task 4 |
| i18n packages | Task 5 |
| he.json + en.json | Task 6 |
| Language toggle in header | Task 7 |
| t() in Settings + Dashboard | Task 8 |
| Make.com webhook UI | Task 9 |
| React Query persist | Task 10 |
| PWA + Workbox | Task 11 |
| Design from `D:\design_handoff_autobizpro\` | All tasks — use app.css classes |

**Files NOT touched:** LeadsPage ✓, PipelinePage ✓, ContactsPage ✓, AutomationsPage ✓, FormsPage ✓, LeadPanel ✓, App.jsx ✓, tokens.css ✓, app.css ✓

**Placeholder scan:** No TBD/TODO found.

**Type consistency:** `settingsApi` defined in Task 3, used in Tasks 4 and 9. `t()` from `useTranslation()` used consistently throughout Tasks 7–9. `useDashboardStats` and `useDashboardChart` defined in Task 2, consumed in same task.
