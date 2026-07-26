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
