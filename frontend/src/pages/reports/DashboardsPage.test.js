import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shrinkPendingBoards, migrateLocalStorageIfNeeded } from './DashboardsPage.jsx'
import { dashboardApi } from '../../api/dashboard'

vi.mock('../../api/dashboard', () => ({
  dashboardApi: {
    createBoard:  vi.fn(),
    createWidget: vi.fn(),
  },
}))

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

const STORAGE_KEY = 'crm_boards_v2'

// Exercises migrateLocalStorageIfNeeded's real async control flow (not just the
// pure shrinkPendingBoards helper it calls) — specifically the exact invariant the
// data-loss fix was meant to guarantee: when a later board's upload fails, every
// board that already succeeded must be gone from localStorage, and every board
// that did not yet succeed (including the one that failed) must still be there
// for the next page load to retry.
describe('migrateLocalStorageIfNeeded — async failure and resume', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('removes only the boards that finished uploading, leaving the rest (including the failed one) in localStorage, and rejects', async () => {
    const board1 = { id: 'local-1', name: 'Board One', widgets: [{ id: 'w1', type: 'kpi', title: 'K' }] }
    const board2 = { id: 'local-2', name: 'Board Two', widgets: [{ id: 'w2', type: 'bar', title: 'B' }] }
    const board3 = { id: 'local-3', name: 'Board Three', widgets: [{ id: 'w3', type: 'pie', title: 'P' }] }
    localStorage.setItem(STORAGE_KEY, JSON.stringify([board1, board2, board3]))

    dashboardApi.createBoard.mockImplementation((name) => {
      if (name === 'Board Two') return Promise.reject(new Error('network down'))
      return Promise.resolve({ data: { data: { id: `server-${name}` } } })
    })
    dashboardApi.createWidget.mockResolvedValue({ data: { data: {} } })

    await expect(migrateLocalStorageIfNeeded()).rejects.toThrow('network down')

    // Board One fully uploaded (createBoard + createWidget both succeeded) -> removed.
    // Board Two's createBoard threw -> it, and everything after it, stays pending.
    const remaining = JSON.parse(localStorage.getItem(STORAGE_KEY))
    expect(remaining.map(b => b.id)).toEqual(['local-2', 'local-3'])

    expect(dashboardApi.createBoard).toHaveBeenCalledWith('Board One')
    expect(dashboardApi.createBoard).toHaveBeenCalledWith('Board Two')
    expect(dashboardApi.createBoard).not.toHaveBeenCalledWith('Board Three')
  })

  it('removes all boards and clears the key when every upload succeeds', async () => {
    const board1 = { id: 'local-1', name: 'Board One', widgets: [] }
    const board2 = { id: 'local-2', name: 'Board Two', widgets: [] }
    localStorage.setItem(STORAGE_KEY, JSON.stringify([board1, board2]))

    dashboardApi.createBoard.mockResolvedValue({ data: { data: { id: 'server-x' } } })
    dashboardApi.createWidget.mockResolvedValue({ data: { data: {} } })

    await migrateLocalStorageIfNeeded()

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
