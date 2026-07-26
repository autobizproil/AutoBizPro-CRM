// Rebuilds an object with its keys sorted, so JSON.stringify comparisons are
// independent of key insertion order (MySQL's JSON column type does not
// preserve the original json_encode key order on refetch).
function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return null
  return Object.keys(obj).sort().reduce((acc, key) => {
    acc[key] = obj[key]
    return acc
  }, {})
}

function normalize(state) {
  return {
    search: state.search || '',
    dateFrom: state.dateFrom || '',
    dateTo: state.dateTo || '',
    conditions: state.conditions ?? [],
    visibleColumns: canonicalize(state.visibleColumns ?? null),
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
