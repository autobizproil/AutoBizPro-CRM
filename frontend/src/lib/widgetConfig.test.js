import { describe, it, expect } from 'vitest'
import { isLegacyWidget, widgetDataParams, emptyWidgetDraft, pivotSeriesRows } from './widgetConfig'

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

  it('includes orConditions when present', () => {
    const params = widgetDataParams({
      entity: 'lead',
      orConditions: [{ field: 'source', operator: 'equals', value: 'website' }],
    })

    expect(JSON.parse(params.orConditions)).toEqual([{ field: 'source', operator: 'equals', value: 'website' }])
  })

  it('omits orConditions when empty', () => {
    const params = widgetDataParams({ entity: 'lead', orConditions: [] })

    expect(params.orConditions).toBeUndefined()
  })

  it('includes groupBy when a second dimension is set', () => {
    const params = widgetDataParams({ entity: 'lead', groupBy: { field: 'assigned_to' } })

    expect(JSON.parse(params.groupBy)).toEqual({ field: 'assigned_to' })
  })

  it('omits groupBy when its field is empty', () => {
    const params = widgetDataParams({ entity: 'lead', groupBy: { field: '' } })

    expect(params.groupBy).toBeUndefined()
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

  it('includes an empty orConditions array', () => {
    expect(emptyWidgetDraft().orConditions).toEqual([])
  })
})

describe('pivotSeriesRows', () => {
  it('turns backend series rows into Recharts multi-series rows', () => {
    const rows = [
      { key: 'facebook', label: 'פייסבוק', color: null, series: { '1': 2, '2': 1 } },
      { key: 'website',  label: 'אתר',      color: null, series: { '1': 0, '2': 3 } },
    ]
    const seriesKeys = [{ key: '1', label: 'דנה' }, { key: '2', label: 'יוסי' }]

    const pivoted = pivotSeriesRows(rows, seriesKeys)

    expect(pivoted).toEqual([
      { name: 'פייסבוק', 'דנה': 2, 'יוסי': 1 },
      { name: 'אתר', 'דנה': 0, 'יוסי': 3 },
    ])
  })

  it('defaults a missing series value to 0', () => {
    const rows = [{ key: 'a', label: 'א', color: null, series: { '1': 5 } }]
    const seriesKeys = [{ key: '1', label: 'X' }, { key: '2', label: 'Y' }]

    expect(pivotSeriesRows(rows, seriesKeys)).toEqual([{ name: 'א', X: 5, Y: 0 }])
  })
})
