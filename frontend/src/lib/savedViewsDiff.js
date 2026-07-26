function normalize(state) {
  return {
    search: state.search || '',
    dateFrom: state.dateFrom || '',
    dateTo: state.dateTo || '',
    conditions: state.conditions ?? [],
    visibleColumns: state.visibleColumns ?? null,
  }
}

export function isViewDirty(view, currentState) {
  if (!view) return false

  const stored = normalize({
    search: view.search,
    dateFrom: view.date_from,
    dateTo: view.date_to,
    conditions: view.conditions,
    visibleColumns: view.visible_columns,
  })
  const current = normalize(currentState)

  return JSON.stringify(stored) !== JSON.stringify(current)
}
