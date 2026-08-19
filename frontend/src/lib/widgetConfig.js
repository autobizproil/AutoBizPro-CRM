// Shape helpers for the Fireberry-style widget builder. Widgets created before
// this builder carry a `dataSource` preset instead of an `entity` — those keep
// using the old per-report fetchers, so every consumer branches on isLegacyWidget.

const COUNT_ONLY = 'count'

export function isLegacyWidget(widget) {
  return !widget?.entity && !!widget?.dataSource
}

export function widgetDataParams(widget) {
  const aggregation = widget.aggregation || COUNT_ONLY
  const params = { entity: widget.entity, aggregation }

  if (widget.displayField) params.displayField = widget.displayField
  if (widget.displayGranularity) params.displayGranularity = widget.displayGranularity
  if (aggregation !== COUNT_ONLY && widget.valueField) params.valueField = widget.valueField

  if (widget.timePeriod?.field && widget.timePeriod?.operator) {
    params.timePeriod = JSON.stringify(widget.timePeriod)
  }
  if (widget.conditions?.length) {
    params.conditions = JSON.stringify(widget.conditions)
  }
  if (widget.orConditions?.length) {
    params.orConditions = JSON.stringify(widget.orConditions)
  }
  if (widget.groupBy?.field) {
    params.groupBy = JSON.stringify(widget.groupBy)
  }

  return params
}

export function emptyWidgetDraft() {
  return {
    type:         'bar',
    title:        '',
    color:        '#2398c2',
    entity:       'lead',
    valueField:   '',
    aggregation:  COUNT_ONLY,
    displayField: 'source',
    timePeriod:   { field: 'created_at', operator: '', value: '' },
    conditions:   [],
    orConditions: [],
    groupBy:      { field: '', granularity: 'month' },
    variant:      'grouped',
    target:       null,
  }
}

const DRILL_DOWN_ROUTES = { lead: '/leads', client: '/clients', contact: '/contacts', task: '/tasks' }

export function drillDownEntityRoute(entity) {
  return DRILL_DOWN_ROUTES[entity] ?? null
}

export function drillDownParams(widget, segment, resolvedRange) {
  const conditions = [...(widget.conditions ?? [])]
  if (widget.displayField && segment?.key !== null && segment?.key !== undefined) {
    conditions.push({ field: widget.displayField, operator: 'equals', value: segment.key })
  }

  const params = { conditions: JSON.stringify(conditions) }
  if (widget.orConditions?.length) params.orConditions = JSON.stringify(widget.orConditions)
  if (resolvedRange?.from) params.date_from = resolvedRange.from
  if (resolvedRange?.to) params.date_to = resolvedRange.to
  if (widget.timePeriod?.field) params.date_field = widget.timePeriod.field

  return params
}

// Fireberry-style widget caption: "<field> - <aggregation>" plus, when a time
// period is set, "<date field>: <period>" — e.g. "סכום כולל - סכום" /
// "נוצר בתאריך: חודש נוכחי". `meta` is the /dashboard/widget-fields payload
// (entities/fields/aggregations/dateOperators), already fetched by whichever
// widget-fields query is live on the page.
export function widgetCaption(widget, meta) {
  if (!meta || isLegacyWidget(widget) || !widget.entity) return null
  const entityFields = meta.fields?.[widget.entity]
  if (!entityFields) return null

  const aggregation = widget.aggregation || 'count'
  const aggLabel     = meta.aggregations?.find(a => a.id === aggregation)?.label ?? null
  const valueLabel   = aggregation !== 'count' && widget.valueField
    ? entityFields.valueFields?.[widget.valueField]?.label
    : null
  const aggLine = valueLabel && aggLabel ? `${valueLabel} - ${aggLabel}` : aggLabel

  let periodLine = null
  if (widget.timePeriod?.field && widget.timePeriod?.operator) {
    const fieldLabel = entityFields.dateFields?.[widget.timePeriod.field]
    const opLabel     = meta.dateOperators?.find(o => o.id === widget.timePeriod.operator)?.label
    if (fieldLabel && opLabel) periodLine = `${fieldLabel}: ${opLabel}`
  }

  return { aggLine, periodLine }
}

export function pivotSeriesRows(rows, seriesKeys) {
  const labelByKey = Object.fromEntries(seriesKeys.map(s => [s.key, s.label]))

  return rows.map(row => {
    const pivoted = { name: row.label }
    for (const s of seriesKeys) {
      pivoted[labelByKey[s.key]] = row.series?.[s.key] ?? 0
    }
    return pivoted
  })
}
