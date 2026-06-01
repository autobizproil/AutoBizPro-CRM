import client from './client'

export const tasksApi = {
  list:    (params) => client.get('/tasks', { params }),
  counts:  ()       => client.get('/tasks/counts'),
  create:  (data)   => client.post('/tasks', data),
  update:  (id, d)  => client.put(`/tasks/${id}`, d),
  destroy: (id)     => client.delete(`/tasks/${id}`),
}

export const PRIORITY_META = {
  low:    { label: 'נמוכה', color: 'text-gray-500 dark:text-gray-400',  dot: 'bg-gray-400' },
  medium: { label: 'בינונית', color: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  high:   { label: 'גבוהה', color: 'text-red-600 dark:text-red-400',     dot: 'bg-red-500' },
}
