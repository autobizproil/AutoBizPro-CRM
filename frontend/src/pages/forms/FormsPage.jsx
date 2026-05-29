import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../../api/client'
import { useAuth } from '../../context/AuthContext'

export default function FormsPage() {
  const { can } = useAuth()
  const qc      = useQueryClient()

  const { data = [], isLoading } = useQuery({
    queryKey: ['forms'],
    queryFn:  () => client.get('/forms').then(r => r.data.data),
  })

  const toggle = useMutation({
    mutationFn: ({ id, active }) => client.put(`/forms/${id}`, { active }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['forms'] }),
  })

  const remove = useMutation({
    mutationFn: (id) => client.delete(`/forms/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['forms'] }),
  })

  const forms = Array.isArray(data) ? data : (data?.data ?? [])

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-6">טפסים</h2>

      {isLoading ? <div className="text-gray-500 text-sm">טוען...</div> : (
        <div className="space-y-3">
          {forms.map(form => (
            <div key={form.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{form.name}</div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {window.location.origin}/f/{form.slug}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${form.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {form.active ? 'פעיל' : 'לא פעיל'}
                  </span>
                  {can('forms', 'can_delete') && (
                    <button onClick={() => remove.mutate(form.id)} className="text-red-400 hover:text-red-600 text-xs">מחק</button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {forms.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">אין טפסים עדיין</div>
          )}
        </div>
      )}
    </div>
  )
}
