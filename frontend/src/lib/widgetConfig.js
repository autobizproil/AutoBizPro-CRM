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
  if (aggregation !== COUNT_ONLY && widget.valueField) params.valueField = widget.valueField

  if (widget.timePeriod?.field && widget.timePeriod?.operator) {
    params.timePeriod = JSON.stringify(widget.timePeriod)
  }
  if (widget.conditions?.length) {
    params.conditions = JSON.stringify(widget.conditions)
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
  }
}
