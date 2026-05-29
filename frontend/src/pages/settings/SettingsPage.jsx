import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import client from '../../api/client'
import { integrationsApi } from '../../api/integrations'
import { useAuth } from '../../context/AuthContext'

export default function SettingsPage() {
  const { can }    = useAuth()
  const qc         = useQueryClient()

  const { data: tenantData } = useQuery({
    queryKey: ['settings-tenant'],
    queryFn:  () => client.get('/settings/tenant').then(r => r.data.data),
  })

  // --- Integrations: Green Invoice ---
  const { data: integ } = useQuery({
    queryKey: ['integrations-settings'],
    queryFn:  () => integrationsApi.getSettings().then(r => r.data.data),
  })
  const [giId, setGiId]         = useState('')
  const [giSecret, setGiSecret] = useState('')
  const [giSandbox, setGiSandbox] = useState(false)
  useEffect(() => {
    if (integ) {
      setGiId(integ.greeninvoice_api_key_id ?? '')
      setGiSecret(integ.greeninvoice_api_key_secret ?? '')
      setGiSandbox(integ.greeninvoice_sandbox === '1')
    }
  }, [integ])

  const saveInteg = useMutation({
    mutationFn: () => integrationsApi.saveSettings({
      greeninvoice_api_key_id: giId,
      greeninvoice_api_key_secret: giSecret,
      greeninvoice_sandbox: giSandbox ? '1' : '0',
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations-settings'] }),
  })
  const testGi = useMutation({ mutationFn: () => integrationsApi.greenInvoiceTest().then(r => r.data) })

  const [whatsappProvider, setWhatsappProvider] = useState('')
  const [whatsappApiKey, setWhatsappApiKey]     = useState('')

  const saveTenant = useMutation({
    mutationFn: (data) => client.put('/settings/tenant', data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['settings-tenant'] }),
  })

  const handleSave = (e) => {
    e.preventDefault()
    saveTenant.mutate({
      settings: {
        whatsapp_provider: whatsappProvider,
        whatsapp_api_key:  whatsappApiKey,
      },
    })
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-6">הגדרות</h2>

      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg">
        <h3 className="font-semibold text-gray-800 mb-4">WhatsApp</h3>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ספק</label>
            <select
              value={whatsappProvider}
              onChange={e => setWhatsappProvider(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">בחר ספק...</option>
              <option value="360dialog">360dialog</option>
              <option value="ultramsg">UltraMsg</option>
              <option value="twilio">Twilio</option>
              <option value="smartsend">SmartSend</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <input
              type="password"
              value={whatsappApiKey}
              onChange={e => setWhatsappApiKey(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="הכנס API key..."
            />
          </div>

          {can('users', 'can_update') && (
            <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
              שמור
            </button>
          )}
        </form>
      </div>

      {/* Green Invoice integration */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg mt-6">
        <h3 className="font-semibold text-gray-800 mb-1">🧾 Green Invoice (חשבוניות)</h3>
        <p className="text-xs text-gray-500 mb-4">הזן את מפתחות ה-API מ-Green Invoice → הגדרות → API. לאחר מכן ניתן להפיק חשבוניות ישירות מכרטיס ליד.</p>
        <form onSubmit={(e) => { e.preventDefault(); saveInteg.mutate() }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key ID</label>
            <input value={giId} onChange={e => setGiId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="key id..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Secret</label>
            <input type="password" value={giSecret} onChange={e => setGiSecret(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="secret..." />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={giSandbox} onChange={e => setGiSandbox(e.target.checked)} className="rounded border-gray-300" />
            מצב Sandbox (בדיקות)
          </label>
          {can('users', 'can_update') && (
            <div className="flex items-center gap-2">
              <button type="submit" disabled={saveInteg.isPending}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saveInteg.isPending ? 'שומר...' : 'שמור'}
              </button>
              <button type="button" onClick={() => testGi.mutate()} disabled={testGi.isPending}
                className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                {testGi.isPending ? 'בודק...' : 'בדוק חיבור'}
              </button>
              {saveInteg.isSuccess && <span className="text-green-600 text-sm">✓ נשמר</span>}
            </div>
          )}
          {testGi.data && (
            <div className={`text-sm px-3 py-2 rounded-lg ${testGi.data.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {testGi.data.message}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
