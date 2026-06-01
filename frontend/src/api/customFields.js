import client from './client'

export const customFieldsApi = {
  list:    ()           => client.get('/custom-fields'),
  create:  (data)       => client.post('/custom-fields', data),
  update:  (id, data)   => client.put(`/custom-fields/${id}`, data),
  destroy: (id)         => client.delete(`/custom-fields/${id}`),
}

export const FIELD_TYPE_LABELS = {
  text:     'טקסט',
  textarea: 'טקסט ארוך',
  number:   'מספר',
  select:   'רשימה',
  date:     'תאריך',
  checkbox: 'כן / לא',
  url:      'קישור',
  phone:    'טלפון',
  email:    'אימייל',
  datetime: 'תאריך ושעה',
  lookup:   'קישור לרשומה',
}
