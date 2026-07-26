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
})
