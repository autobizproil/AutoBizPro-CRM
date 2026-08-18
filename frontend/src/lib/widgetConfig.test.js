import { describe, it, expect } from 'vitest'
import { isLegacyWidget, widgetDataParams, emptyWidgetDraft } from './widgetConfig'

describe('isLegacyWidget', () => {
  it('treats dataSource-only widgets as legacy', () => {
    expect(isLegacyWidget({ dataSource: 'leads_by_source' })).toBe(true)
  })

  it('treats entity widgets as new', () => {
    expect(isLegacyWidget({ entity: 'lead', displayField: 'source' })).toBe(false)
  })

  it('prefers entity when a widget somehow has both', () => {
    expect(isLegacyWidget({ dataSource: 'leads_by_source', entity: 'lead' })).toBe(false)
  })
})

describe('widgetDataParams', () => {
  it('includes entity, aggregation and display field', () => {
    const params = widgetDataParams({
      entity: 'lead', aggregation: 'count', displayField: 'source',
    })

    expect(params).toEqual({ entity: 'lead', aggregation: 'count', displayField: 'source' })
  })

  it('omits empty optional keys', () => {
    const params = widgetDataParams({ entity: 'task', displayField: '', conditions: [] })

    expect(params).toEqual({ entity: 'task', aggregation: 'count' })
  })

  it('json-encodes timePeriod and conditions', () => {
    const params = widgetDataParams({
      entity: 'lead',
      timePeriod: { field: 'created_at', operator: 'current_month' },
      conditions: [{ field: 'name', operator: 'contains', value: 'כהן' }],
    })

    expect(JSON.parse(params.timePeriod)).toEqual({ field: 'created_at', operator: 'current_month' })
    expect(JSON.parse(params.conditions)).toEqual([{ field: 'name', operator: 'contains', value: 'כהן' }])
  })

  it('drops a timePeriod with no operator', () => {
    const params = widgetDataParams({ entity: 'lead', timePeriod: { field: 'created_at' } })

    expect(params.timePeriod).toBeUndefined()
  })

  it('includes valueField only when the aggregation needs one', () => {
    expect(widgetDataParams({ entity: 'lead', aggregation: 'count', valueField: 'amount' }).valueField)
      .toBeUndefined()
    expect(widgetDataParams({ entity: 'lead', aggregation: 'sum', valueField: 'amount' }).valueField)
      .toBe('amount')
  })
})

describe('emptyWidgetDraft', () => {
  it('defaults to a lead bar chart counting records', () => {
    const draft = emptyWidgetDraft()

    expect(draft.type).toBe('bar')
    expect(draft.entity).toBe('lead')
    expect(draft.aggregation).toBe('count')
    expect(draft.conditions).toEqual([])
    expect(draft.timePeriod.operator).toBe('')
  })

  it('returns a fresh object each call', () => {
    const a = emptyWidgetDraft()
    a.conditions.push({ field: 'name', operator: 'equals', value: 'x' })

    expect(emptyWidgetDraft().conditions).toEqual([])
  })
})
