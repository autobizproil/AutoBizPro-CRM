import { describe, it, expect } from 'vitest'
import { isViewDirty } from './savedViewsDiff'

const baseView = {
  search: 'abc', date_from: '', date_to: '',
  conditions: [{ field: 'name', operator: 'equals', value: 'x' }],
  visible_columns: null,
}

describe('isViewDirty', () => {
  it('is never dirty when no view is active', () => {
    expect(isViewDirty(null, { search: '', dateFrom: '', dateTo: '', conditions: [] })).toBe(false)
  })

  it('is not dirty when current state matches the view exactly', () => {
    const current = { search: 'abc', dateFrom: '', dateTo: '', conditions: baseView.conditions }
    expect(isViewDirty(baseView, current)).toBe(false)
  })

  it('is dirty when search diverges', () => {
    const current = { search: 'changed', dateFrom: '', dateTo: '', conditions: baseView.conditions }
    expect(isViewDirty(baseView, current)).toBe(true)
  })

  it('is dirty when conditions diverge', () => {
    const current = { search: 'abc', dateFrom: '', dateTo: '', conditions: [] }
    expect(isViewDirty(baseView, current)).toBe(true)
  })

  it('is not dirty when visible_columns has the same keys in a different order', () => {
    const view = {
      ...baseView,
      visible_columns: { name: true, phone: true, email: false },
    }
    const current = {
      search: 'abc', dateFrom: '', dateTo: '', conditions: baseView.conditions,
      visibleColumns: { email: false, name: true, phone: true },
    }
    expect(isViewDirty(view, current)).toBe(false)
  })
})
