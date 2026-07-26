# Customizable Top Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each user drag-reorder the top nav bar and choose which items show directly vs. collapse into "עוד" (More), including custom record types (currently hardcoded/fixed).

**Architecture:** One new `localStorage`-backed utility module computes the effective nav layout (defaults + saved overrides, versioned like the existing `crm_leads_cols` pattern). One new modal component lets the user drag items between "main bar" and "More" and reorder within each group. `Layout.jsx` is updated to render from the computed layout instead of the hardcoded `PRIMARY_NAV`/`MORE_NAV` arrays, and custom record types become full participants instead of being stuck in their own always-in-More section.

**Tech Stack:** React, `localStorage`, native HTML5 drag/drop (same pattern already used for Leads' column reorder).

## Global Constraints

- Per-user/per-browser only — `localStorage`, no backend storage.
- Custom record types (from `recordTypesApi.list()`) are full nav items now — reorderable and pinnable, not a fixed always-in-More section.
- If `localStorage` is empty, stale-versioned, or missing/extra items relative to current code, unresolved items fall back to their hardcoded default group/position — nothing disappears, nothing crashes.
- Spec: `docs/superpowers/specs/2026-07-26-nav-customization-design.md`

---

### Task 1: `navLayout` utility — compute effective layout from defaults + localStorage

**Files:**
- Create: `frontend/src/lib/navLayout.js`
- Test: `frontend/src/lib/navLayout.test.js`

**Interfaces:**
- Produces: `computeNavLayout(defaultItems, customItems)` → `{ pinned: Item[], more: Item[] }` where `Item = {key, to, labelKey?, label?, badge?, icon?}`. `saveNavLayout(pinned, more)` → writes to `localStorage['crm_nav_layout']`. Both consumed by Task 3 (`Layout.jsx`) and Task 2 (the edit modal).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/navLayout.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { computeNavLayout, saveNavLayout } from './navLayout'

const DEFAULTS = [
  { key: 'leads', to: '/leads', labelKey: 'leads' },
  { key: 'clients', to: '/clients', labelKey: 'clients' },
]
const MORE_DEFAULTS = [
  { key: 'dashboard', to: '/dashboard', labelKey: 'dashboard' },
]

describe('computeNavLayout', () => {
  beforeEach(() => localStorage.clear())

  it('falls back to hardcoded defaults when nothing is saved', () => {
    const { pinned, more } = computeNavLayout(DEFAULTS, MORE_DEFAULTS, [])
    expect(pinned.map(i => i.key)).toEqual(['leads', 'clients'])
    expect(more.map(i => i.key)).toEqual(['dashboard'])
  })

  it('applies a saved layout', () => {
    saveNavLayout([{ key: 'clients', position: 0 }], [{ key: 'leads', position: 0 }, { key: 'dashboard', position: 1 }])
    const { pinned, more } = computeNavLayout(DEFAULTS, MORE_DEFAULTS, [])
    expect(pinned.map(i => i.key)).toEqual(['clients'])
    expect(more.map(i => i.key)).toEqual(['leads', 'dashboard'])
  })

  it('places an unresolved saved key nowhere, and includes a brand-new default item in its default group', () => {
    saveNavLayout([{ key: 'clients', position: 0 }], [{ key: 'deleted-record-type', position: 0 }])
    const { pinned, more } = computeNavLayout(DEFAULTS, MORE_DEFAULTS, [])
    expect(pinned.map(i => i.key)).toEqual(['clients', 'leads']) // 'leads' unresolved in saved layout -> falls back to its default group, appended
    expect(more.map(i => i.key)).toEqual(['dashboard']) // 'deleted-record-type' has no matching item -> dropped
  })

  it('includes custom record types as full participants, defaulting to the more group', () => {
    const custom = [{ key: 'rt_abc123', to: '/records/invoices', label: 'חשבוניות' }]
    const { more } = computeNavLayout(DEFAULTS, MORE_DEFAULTS, custom)
    expect(more.some(i => i.key === 'rt_abc123')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/navLayout.test.js`
Expected: FAIL (module doesn't exist)

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/navLayout.js`:

```js
const STORAGE_KEY = 'crm_nav_layout'
const VERSION = 'v1'

function readSaved() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!raw || raw._v !== VERSION || !Array.isArray(raw.pinned) || !Array.isArray(raw.more)) return null
    return raw
  } catch {
    return null
  }
}

export function saveNavLayout(pinned, more) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ _v: VERSION, pinned, more }))
}

/**
 * @param defaultItems default "pinned" items (code-defined PRIMARY_NAV)
 * @param moreDefaults default "more" items (code-defined MORE_NAV)
 * @param customItems dynamic custom-record-type nav items (default group: more)
 */
export function computeNavLayout(defaultItems, moreDefaults, customItems) {
  const allItems = new Map()
  for (const item of defaultItems) allItems.set(item.key, { item, defaultGroup: 'pinned' })
  for (const item of moreDefaults) allItems.set(item.key, { item, defaultGroup: 'more' })
  for (const item of customItems) allItems.set(item.key, { item, defaultGroup: 'more' })

  const saved = readSaved()
  const resolved = new Set()
  const pinned = []
  const more = []

  if (saved) {
    for (const { key } of saved.pinned.slice().sort((a, b) => a.position - b.position)) {
      const entry = allItems.get(key)
      if (entry) { pinned.push(entry.item); resolved.add(key) }
    }
    for (const { key } of saved.more.slice().sort((a, b) => a.position - b.position)) {
      const entry = allItems.get(key)
      if (entry) { more.push(entry.item); resolved.add(key) }
    }
  }

  // Anything not resolved from saved data (new items, or no saved layout at all) falls back to its default group, appended in default order
  for (const [key, { item, defaultGroup }] of allItems) {
    if (resolved.has(key)) continue
    ;(defaultGroup === 'pinned' ? pinned : more).push(item)
  }

  return { pinned, more }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/navLayout.test.js`
Expected: PASS, 4/4

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/navLayout.js frontend/src/lib/navLayout.test.js
git commit -m "feat: navLayout utility for customizable nav bar ordering"
```

---

### Task 2: `NavEditModal` component

**Files:**
- Create: `frontend/src/components/ui/NavEditModal.jsx`

**Interfaces:**
- Consumes: nothing from Task 1 directly (receives `pinned`/`more` arrays as props, already resolved by the caller).
- Produces: `<NavEditModal open, onClose, pinned, more, onSave(pinned, more) />` — `onSave` is called with the new `{key, position}`-shaped arrays (matching `saveNavLayout`'s expected input) when the user finishes reordering and the modal is closed. Consumed by Task 3.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/ui/NavEditModal.jsx`:

```jsx
import { useState, useEffect } from 'react'

function itemLabel(item, tr) {
  return item.labelKey ? tr(item.labelKey) : item.label
}

export default function NavEditModal({ open, onClose, pinned, more, onSave, tr }) {
  const [localPinned, setLocalPinned] = useState(pinned)
  const [localMore, setLocalMore] = useState(more)
  const [dragKey, setDragKey] = useState(null)

  useEffect(() => {
    if (open) { setLocalPinned(pinned); setLocalMore(more) }
  }, [open, pinned, more])

  if (!open) return null

  const findAndRemove = (key) => {
    let found = localPinned.find(i => i.key === key)
    let fromPinned = true
    if (!found) { found = localMore.find(i => i.key === key); fromPinned = false }
    return { found, fromPinned }
  }

  const dropInto = (targetGroup, targetIndex) => {
    if (!dragKey) return
    const { found } = findAndRemove(dragKey)
    if (!found) return
    setLocalPinned(p => p.filter(i => i.key !== dragKey))
    setLocalMore(m => m.filter(i => i.key !== dragKey))
    const setter = targetGroup === 'pinned' ? setLocalPinned : setLocalMore
    setter(list => {
      const next = list.slice()
      next.splice(targetIndex, 0, found)
      return next
    })
    setDragKey(null)
  }

  const handleSave = () => {
    onSave(
      localPinned.map((item, position) => ({ key: item.key, position })),
      localMore.map((item, position) => ({ key: item.key, position })),
    )
    onClose()
  }

  const resetDefault = () => {
    localStorage.removeItem('crm_nav_layout')
    window.location.reload()
  }

  const renderGroup = (title, items, group) => (
    <div className="flex-1">
      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{title}</div>
      <div
        className="space-y-1 min-h-[80px] border border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-2"
        onDragOver={e => e.preventDefault()}
        onDrop={() => dropInto(group, items.length)}
      >
        {items.map((item, i) => (
          <div key={item.key}
            draggable
            onDragStart={() => setDragKey(item.key)}
            onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
            onDrop={e => { e.stopPropagation(); dropInto(group, i) }}
            className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm cursor-move flex items-center gap-2">
            <span className="text-gray-300 dark:text-gray-500">⠿</span>
            {item.icon && <span>{item.icon}</span>}
            {itemLabel(item, tr)}
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">עריכת תפריט</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-4 flex gap-4">
          {renderGroup('בסרגל הראשי', localPinned, 'pinned')}
          {renderGroup('בתפריט עוד', localMore, 'more')}
        </div>
        <div className="flex gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
          <button onClick={handleSave}
            className="flex-1 bg-[#2398c2] hover:bg-[#1d7fa3] text-white py-2.5 rounded-lg text-sm font-medium transition-colors">שמור</button>
          <button onClick={resetDefault}
            className="px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm">איפוס לברירת מחדל</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx vite build`
Expected: clean build (nothing consumes this component yet — this checks the file itself is syntactically valid).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/NavEditModal.jsx
git commit -m "feat: NavEditModal drag-to-reorder component"
```

---

### Task 3: Wire into `Layout.jsx`

**Files:**
- Modify: `frontend/src/components/ui/Layout.jsx`

**Interfaces:**
- Consumes: `computeNavLayout`/`saveNavLayout` from Task 1, `NavEditModal` from Task 2.

- [ ] **Step 1: Add imports**

After line 9 (`import { recordTypesApi } from '../../api/recordTypes'`), add:

```js
import { computeNavLayout, saveNavLayout } from '../../lib/navLayout'
import NavEditModal from './NavEditModal'
```

- [ ] **Step 2: Compute the layout and add edit-modal state**

Line 65 currently reads:
```js
  const customNav = recordTypes.map(rt => ({ to: `/records/${rt.slug}`, label: rt.label, icon: rt.icon }))
```
Change to (custom nav items now need a stable `key` for `computeNavLayout`, using the record type's slug):
```js
  const customNav = recordTypes.map(rt => ({ key: rt.slug, to: `/records/${rt.slug}`, label: rt.label, icon: rt.icon }))
  const PRIMARY_NAV_KEYED = PRIMARY_NAV.map(item => ({ ...item, key: item.to }))
  const MORE_NAV_KEYED = MORE_NAV.map(item => ({ ...item, key: item.to }))
  const [navLayoutVersion, setNavLayoutVersion] = useState(0)
  const { pinned: navPinned, more: navMore } = computeNavLayout(PRIMARY_NAV_KEYED, MORE_NAV_KEYED, customNav)
  const [showNavEdit, setShowNavEdit] = useState(false)
```
(`navLayoutVersion` forces a re-render after saving — `localStorage` writes don't trigger React re-renders on their own.)

- [ ] **Step 3: Render the nav bar from the computed layout**

Lines 82-106 (the `<nav>` block mapping over `PRIMARY_NAV`) currently read:
```jsx
        <nav className="flex items-center gap-0.5 flex-1 justify-center">
          {PRIMARY_NAV.map(({ to, labelKey, badge }) => {
            const count = badge ? badges[badge] : 0
            return (
              <NavLink
                key={to}
                to={to}
```
Change `PRIMARY_NAV.map(({ to, labelKey, badge }) => {` to `navPinned.map(({ to, labelKey, label, badge, icon }) => {` and change the label rendering inside (around line 98, `{tr(labelKey)}`) to handle both code-defined items (labelKey) and custom-record-type items (plain label + icon):
```jsx
                {labelKey ? tr(labelKey) : <>{icon && <span className="ml-1">{icon}</span>}{label}</>}
```

- [ ] **Step 4: Render the More dropdown from the computed layout, add the edit button**

Lines 121-157 (the More dropdown's contents, mapping `MORE_NAV` then separately `customNav`) — replace the two separate `.map()` blocks (`MORE_NAV.map(...)` at line 123 through the `customNav.length > 0 && (...)` block ending around line 157) with one unified map over `navMore`, plus an "edit menu" trigger appended at the bottom:

```jsx
            {showMore && (
              <div className="absolute top-full mt-1 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-40 py-1.5 w-48 max-h-[70vh] overflow-y-auto" dir="rtl">
                {navMore.map(({ to, labelKey, label, icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `block px-4 py-2 text-sm transition-colors truncate ${
                        isActive
                          ? 'bg-[#2398c2]/10 text-[#2398c2] font-medium'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`
                    }
                  >
                    {labelKey ? tr(labelKey) : <>{icon && <span className="ml-1">{icon}</span>}{label}</>}
                  </NavLink>
                ))}
                <div className="my-1.5 border-t border-gray-100 dark:border-gray-700" />
                <button
                  onClick={() => { setShowMore(false); setShowNavEdit(true) }}
                  className="w-full text-right block px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  ⚙️ עריכת תפריט
                </button>
              </div>
            )}
```

(Do not modify anything below this block — the `showMore`-toggle button itself, defined just above at lines 109-120, stays as-is.)

- [ ] **Step 5: Render the modal**

Find the component's closing `</div>` that ends the whole `Layout` return (the outermost wrapping `<div className="flex flex-col h-screen ...">` from line 68) and add the modal just before it closes:

```jsx
      <NavEditModal
        open={showNavEdit}
        onClose={() => setShowNavEdit(false)}
        pinned={navPinned}
        more={navMore}
        tr={tr}
        onSave={(pinned, more) => { saveNavLayout(pinned, more); setNavLayoutVersion(v => v + 1) }}
      />
```

- [ ] **Step 6: Verify build**

Run: `cd frontend && npx vite build`
Expected: clean build.

- [ ] **Step 7: Manual verification in browser**

Log in, click "עוד" then "⚙️ עריכת תפריט". Confirm the modal shows two columns (main bar items, More items) including any custom record types. Drag one item from More into the main bar column, click "שמור". Confirm the header immediately reflects the new item without a page reload. Reload the page — confirm the layout persisted. Click "איפוס לברירת מחדל" — confirm it reverts to the original grouping.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ui/Layout.jsx
git commit -m "feat: wire customizable nav layout into Layout.jsx"
```

---

## Final check (after all tasks)

- [ ] Run `cd frontend && npx vitest run src/lib/navLayout.test.js` — passes.
- [ ] Run `cd frontend && npx vite build` — clean build.
- [ ] Manual browser check per Task 3 Step 7.
