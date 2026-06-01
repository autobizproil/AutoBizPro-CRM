import { useAutomations, useToggleAutomation, useDeleteAutomation } from '../../hooks/useAutomations'
import { useAuth } from '../../context/AuthContext'

const TRIGGER_LABELS = {
  lead_created:       'ליד חדש נוצר',
  lead_stage_changed: 'שלב ליד השתנה',
  form_submitted:     'טופס נשלח',
  contact_created:    'איש קשר חדש',
  scheduled:          'מתוזמן',
}

export default function AutomationsPage() {
  const { can }               = useAuth()
  const { data = [], isLoading } = useAutomations()
  const toggle                = useToggleAutomation()
  const remove                = useDeleteAutomation()

  const automations = Array.isArray(data) ? data : (data?.data ?? [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">אוטומציות</h2>
      </div>

      {isLoading ? <div className="text-gray-500 text-sm">טוען...</div> : (
        <div className="space-y-3">
          {automations.map(auto => (
            <div key={auto.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{auto.name}</div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    טריגר: {TRIGGER_LABELS[auto.trigger_type] ?? auto.trigger_type}
                    {' · '}
                    {auto.actions?.length ?? 0} פעולות
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {can('automations', 'can_update') && (
                    <button
                      onClick={() => toggle.mutate(auto.id)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${auto.active ? 'bg-indigo-600' : 'bg-gray-200'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${auto.active ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  )}
                  {can('automations', 'can_delete') && (
                    <button onClick={() => remove.mutate(auto.id)} className="text-red-400 hover:text-red-600 text-xs">מחק</button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {automations.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">אין אוטומציות עדיין</div>
          )}
        </div>
      )}
    </div>
  )
}
