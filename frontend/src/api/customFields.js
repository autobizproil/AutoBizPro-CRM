import client from './client'

export const ENTITIES = [
  { id: 'leads',    label: 'לידים' },
  { id: 'clients',  label: 'לקוחות' },
  { id: 'contacts', label: 'אנשי קשר' },
  { id: 'tasks',    label: 'משימות' },
]

export const customFieldsApi = {
  list:    (entity)       => client.get('/custom-fields', { params: { entity } }),
  create:  (entity, data) => client.post('/custom-fields', { entity, ...data }),
  update:  (id, data)     => client.put(`/custom-fields/${id}`, data),
  reorder: (entity, ids)  => client.post('/custom-fields/reorder', { entity, ids }),
  destroy: (id)           => client.delete(`/custom-fields/${id}`),
}

export const FIELD_TYPE_LABELS = {
  text:     'טקסט',
  textarea: 'טקסט ארוך',
  number:   'מספר',
  select:   'רשימה נפתחת',
  date:     'תאריך',
  datetime: 'תאריך ושעה',
  checkbox: 'כן / לא',
  url:      'קישור',
  phone:    'טלפון',
  email:    'אימייל',
  lookup:   'קישור לרשומה',
}

// Types the user can pick when creating a custom field (lookup is system-only)
export const CREATABLE_TYPES = ['text', 'textarea', 'number', 'select', 'date', 'datetime', 'checkbox', 'url', 'phone', 'email']
