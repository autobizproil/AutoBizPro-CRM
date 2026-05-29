import client from './client'

export const whatsappApi = {
  list:   () => client.get('/whatsapp-templates'),
  create: (data) => client.post('/whatsapp-templates', data),
  update: (id, data) => client.put(`/whatsapp-templates/${id}`, data),
  remove: (id) => client.delete(`/whatsapp-templates/${id}`),
}

// Fill {placeholders} client-side from a lead object
export function renderTemplate(body, data = {}) {
  return body.replace(/\{(\w+)\}/g, (m, key) => data[key] ?? m)
}

// Build a wa.me deep link. Normalizes Israeli numbers to +972.
export function waLink(phone, message = '') {
  let digits = (phone ?? '').replace(/\D+/g, '')
  if (digits.startsWith('0')) digits = '972' + digits.slice(1)
  const text = message ? `?text=${encodeURIComponent(message)}` : ''
  return `https://wa.me/${digits}${text}`
}
