import client from './client'

export const integrationsApi = {
  getSettings:  () => client.get('/integrations/settings'),
  saveSettings: (data) => client.put('/integrations/settings', data),
  greenInvoiceTest: () => client.post('/integrations/greeninvoice/test'),
  greenInvoiceCreate: (leadId, payload) => client.post(`/integrations/greeninvoice/lead/${leadId}`, payload),
}

export const GI_DOC_TYPES = [
  { value: 400, label: 'קבלה' },
  { value: 330, label: 'חשבונית מס קבלה' },
  { value: 305, label: 'חשבונית מס' },
  { value: 320, label: 'חשבונית זיכוי' },
]
