import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import client from '../../api/client'
import { useAuth } from '../../context/AuthContext'

export default function SettingsPage() {
  const { can }    = useAuth()
  const qc         = useQueryClient()

  const { data: tenantData } = useQuery({
    queryKey: ['settings-tenant'],
    queryFn:  () => client.get('/settings/tenant').then(r => r.data.data),
  })

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
    </div>
  )
}
