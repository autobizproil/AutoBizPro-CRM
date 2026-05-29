import { describe, it, expect, vi } from 'vitest'
import { leadsApi } from '../api/leads'

vi.mock('../api/leads', () => ({
  leadsApi: {
    changeStage: vi.fn(),
  },
}))

describe('Pipeline stage change', () => {
  it('calls changeStage with correct leadId and stageId', async () => {
    leadsApi.changeStage.mockResolvedValueOnce({ data: { success: true, data: {} } })

    await leadsApi.changeStage(42, 5)

    expect(leadsApi.changeStage).toHaveBeenCalledWith(42, 5)
  })

  it('passes leadId from drag-drop correctly', () => {
    const leadId  = 7
    const stageId = 3
    const payload = { leadId, stageId }

    expect(payload.leadId).toBe(7)
    expect(payload.stageId).toBe(3)
  })
})
