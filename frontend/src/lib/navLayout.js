const STORAGE_KEY = 'crm_nav_layout'
const VERSION = 'v1'

function readSaved() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!raw || raw._v !== VERSION || !Array.isArray(raw.pinned) || !Array.isArray(raw.more)) return null
    return raw
  } catch {
    return null
  }
}

export function saveNavLayout(pinned, more) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ _v: VERSION, pinned, more }))
}

/**
 * @param defaultItems default "pinned" items (code-defined PRIMARY_NAV)
 * @param moreDefaults default "more" items (code-defined MORE_NAV)
 * @param customItems dynamic custom-record-type nav items (default group: more)
 */
export function computeNavLayout(defaultItems, moreDefaults, customItems) {
  const allItems = new Map()
  for (const item of defaultItems) allItems.set(item.key, { item, defaultGroup: 'pinned' })
  for (const item of moreDefaults) allItems.set(item.key, { item, defaultGroup: 'more' })
  for (const item of customItems) allItems.set(item.key, { item, defaultGroup: 'more' })

  const saved = readSaved()
  const resolved = new Set()
  const pinned = []
  const more = []

  if (saved) {
    for (const { key } of saved.pinned.slice().sort((a, b) => a.position - b.position)) {
      const entry = allItems.get(key)
      if (entry) { pinned.push(entry.item); resolved.add(key) }
    }
    for (const { key } of saved.more.slice().sort((a, b) => a.position - b.position)) {
      const entry = allItems.get(key)
      if (entry) { more.push(entry.item); resolved.add(key) }
    }
  }

  // Anything not resolved from saved data (new items, or no saved layout at all) falls back to its default group, appended in default order
  for (const [key, { item, defaultGroup }] of allItems) {
    if (resolved.has(key)) continue
    ;(defaultGroup === 'pinned' ? pinned : more).push(item)
  }

  return { pinned, more }
}
