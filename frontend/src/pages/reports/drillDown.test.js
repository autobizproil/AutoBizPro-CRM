import { describe, it, expect } from 'vitest'
import { drillDownEntityRoute, drillDownParams } from '../../lib/widgetConfig'

describe('drillDownEntityRoute', () => {
  it('maps known entities to their list endpoint', () => {
    expect(drillDownEntityRoute('lead')).toBe('/leads')
    expect(drillDownEntityRoute('client')).toBe('/clients')
    expect(drillDownEntityRoute('contact')).toBe('/contacts')
    expect(drillDownEntityRoute('task')).toBe('/tasks')
  })

  it('returns null for activity — no generic list endpoint exists', () => {
    expect(drillDownEntityRoute('activity')).toBeNull()
  })

  it('returns null for an unknown entity', () => {
    expect(drillDownEntityRoute('invoice')).toBeNull()
  })
})

describe('drillDownParams', () => {
  it('combines the widget conditions with a segment equals-condition', () => {
    const widget = { displayField: 'source', conditions: [{ field: 'status', operator: 'equals', value: 'open' }] }
    const params = drillDownParams(widget, { key: 'facebook' })

    const conditions = JSON.parse(params.conditions)
    expect(conditions).toEqual([
      { field: 'status', operator: 'equals', value: 'open' },
      { field: 'source', operator: 'equals', value: 'facebook' },
    ])
  })

  it('includes orConditions when present', () => {
    const widget = { displayField: 'source', conditions: [], orConditions: [{ field: 'name', operator: 'contains', value: 'x' }] }
    const params = drillDownParams(widget, { key: 'facebook' })

    expect(JSON.parse(params.orConditions)).toEqual([{ field: 'name', operator: 'contains', value: 'x' }])
  })

  it('translates a resolvedRange into date_from/date_to', () => {
    const widget = { displayField: 'source', conditions: [] }
    const params = drillDownParams(widget, { key: 'facebook' }, { from: '2026-08-01', to: '2026-08-31' })

    expect(params.date_from).toBe('2026-08-01')
    expect(params.date_to).toBe('2026-08-31')
  })

  it('omits a null segment key from the conditions (ungrouped total row)', () => {
    const widget = { displayField: 'source', conditions: [] }
    const params = drillDownParams(widget, { key: null })

    expect(JSON.parse(params.conditions)).toEqual([])
  })
})
