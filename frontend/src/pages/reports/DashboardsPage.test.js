import { describe, it, expect } from 'vitest'
import { shrinkPendingBoards } from './DashboardsPage.jsx'

// shrinkPendingBoards is the pure piece of migrateLocalStorageIfNeeded's
// "drain one board at a time" logic — it removes the just-uploaded board
// (always the head, since migration processes boards in array order) from
// the still-pending list, which is what gets re-persisted to localStorage
// after each successful per-board upload.
describe('shrinkPendingBoards', () => {
  it('removes the first (just-migrated) board from the pending list', () => {
    const pending = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(shrinkPendingBoards(pending)).toEqual([{ id: 'b' }, { id: 'c' }])
  })

  it('returns an empty array once the last board is drained', () => {
    expect(shrinkPendingBoards([{ id: 'only' }])).toEqual([])
  })

  it('does not mutate the input array', () => {
    const pending = [{ id: 'a' }, { id: 'b' }]
    shrinkPendingBoards(pending)
    expect(pending).toEqual([{ id: 'a' }, { id: 'b' }])
  })
})
