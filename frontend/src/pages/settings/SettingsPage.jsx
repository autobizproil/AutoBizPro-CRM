import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import client from '../../api/client'
import { integrationsApi } from '../../api/integrations'
import { useAuth } from '../../context/AuthContext'
import { usePreferences } from '../../context/PreferencesContext'
import { translations } from '../../i18n/translations'

export default function SettingsPage() {
  const { can }    = useAuth()
  const qc         = useQueryClient()
  const { theme, lang, fontSize, setTheme, setLang, setFontSize } = usePreferences()
  const tr = (key) => translations[lang]?.[key] ?? key

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

  // --- Integrations: Cardcom ---
  const [cardcomTerminal, setCardcomTerminal]   = useState('')
  const [cardcomApiName, setCardcomApiName]     = useState('')
  const [cardcomApiPassword, setCardcomApiPassword] = useState('')

  // --- Integrations: Yesh Invoice ---
  const [yeshUserKey, setYeshUserKey]   = useState('')
  const [yeshSecretKey, setYeshSecretKey] = useState('')

  useEffect(() => {
    if (integ) {
      setGiId(integ.greeninvoice_api_key_id ?? '')
      setGiSecret(integ.greeninvoice_api_key_secret ?? '')
      setGiSandbox(integ.greeninvoice_sandbox === '1')
      setCardcomTerminal(integ.cardcom_terminal ?? '')
      setCardcomApiName(integ.cardcom_api_name ?? '')
      setCardcomApiPassword(integ.cardcom_api_password ?? '')
      setYeshUserKey(integ.yesh_user_key ?? '')
      setYeshSecretKey(integ.yesh_secret_key ?? '')
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

  const saveCardcom = useMutation({
    mutationFn: () => integrationsApi.saveSettings({
      cardcom_terminal: cardcomTerminal,
      cardcom_api_name: cardcomApiName,
      cardcom_api_password: cardcomApiPassword,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations-settings'] }),
  })

  const saveYesh = useMutation({
    mutationFn: () => integrationsApi.saveSettings({
      yesh_user_key: yeshUserKey,
      yesh_secret_key: yeshSecretKey,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations-settings'] }),
  })
  const testYesh = useMutation({ mutationFn: () => integrationsApi.yeshInvoiceTest().then(r => r.data) })

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

      {/* Cardcom integration */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg mt-6">
        <h3 className="font-semibold text-gray-800 mb-1">💳 Cardcom (סליקה)</h3>
        <p className="text-xs text-gray-500 mb-4">הזן את פרטי ה-API של Cardcom כדי לאפשר שליחת עמודי תשלום ישירות מכרטיס ליד.</p>
        <form onSubmit={(e) => { e.preventDefault(); saveCardcom.mutate() }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">מספר טרמינל</label>
            <input value={cardcomTerminal} onChange={e => setCardcomTerminal(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="מספר טרמינל..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם משתמש API</label>
            <input value={cardcomApiName} onChange={e => setCardcomApiName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="שם משתמש..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סיסמת API</label>
            <input type="password" value={cardcomApiPassword} onChange={e => setCardcomApiPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="סיסמה..." />
          </div>
          {can('users', 'can_update') && (
            <div className="flex items-center gap-2">
              <button type="submit" disabled={saveCardcom.isPending}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saveCardcom.isPending ? 'שומר...' : 'שמור'}
              </button>
              {saveCardcom.isSuccess && <span className="text-green-600 text-sm">✓ נשמר</span>}
            </div>
          )}
          {saveCardcom.isError && (
            <div className="text-sm px-3 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200">
              {saveCardcom.error?.response?.data?.message ?? 'שגיאה בשמירת הגדרות Cardcom'}
            </div>
          )}
        </form>
      </div>

      {/* Yesh Invoice integration */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg mt-6">
        <h3 className="font-semibold text-gray-800 mb-1">🧾 Yesh Invoice (חשבוניות)</h3>
        <p className="text-xs text-gray-500 mb-4">הזן את מפתחות ה-API של Yesh Invoice להפקת חשבוניות ישירות מכרטיס ליד.</p>
        <form onSubmit={(e) => { e.preventDefault(); saveYesh.mutate() }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">מפתח משתמש</label>
            <input value={yeshUserKey} onChange={e => setYeshUserKey(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="user key..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">מפתח סודי</label>
            <input type="password" value={yeshSecretKey} onChange={e => setYeshSecretKey(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="secret key..." />
          </div>
          {can('users', 'can_update') && (
            <div className="flex items-center gap-2">
              <button type="submit" disabled={saveYesh.isPending}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saveYesh.isPending ? 'שומר...' : 'שמור'}
              </button>
              <button type="button" onClick={() => testYesh.mutate()} disabled={testYesh.isPending}
                className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                {testYesh.isPending ? 'בודק...' : 'בדוק חיבור'}
              </button>
              {saveYesh.isSuccess && <span className="text-green-600 text-sm">✓ נשמר</span>}
            </div>
          )}
          {testYesh.data && (
            <div className={`text-sm px-3 py-2 rounded-lg ${testYesh.data.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {testYesh.data.message}
            </div>
          )}
          {saveYesh.isError && (
            <div className="text-sm px-3 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200">
              {saveYesh.error?.response?.data?.message ?? 'שגיאה בשמירת הגדרות Yesh Invoice'}
            </div>
          )}
        </form>
      </div>

      {/* Preferences */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 max-w-lg mt-6 dark:text-gray-100">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-5">⚙️ {tr('preferences')}</h3>

        {/* Language */}
        <div className="mb-5">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{tr('language')}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLang('he')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                lang === 'he'
                  ? 'bg-[#2398c2] text-white border-[#2398c2]'
                  : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              {tr('hebrew')}
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                lang === 'en'
                  ? 'bg-[#2398c2] text-white border-[#2398c2]'
                  : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              {tr('english')}
            </button>
          </div>
        </div>

        {/* Theme */}
        <div className="mb-5">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{lang === 'en' ? 'Theme' : 'מצב תצוגה'}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                theme === 'light'
                  ? 'bg-[#2398c2] text-white border-[#2398c2]'
                  : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              ☀️ {tr('lightMode')}
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                theme === 'dark'
                  ? 'bg-[#2398c2] text-white border-[#2398c2]'
                  : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              🌙 {tr('darkMode')}
            </button>
          </div>
        </div>

        {/* Font size / Accessibility */}
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{tr('accessibility')} — {tr('fontSize')}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFontSize('normal')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                fontSize === 'normal'
                  ? 'bg-[#2398c2] text-white border-[#2398c2]'
                  : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              {tr('normalSize')}
            </button>
            <button
              type="button"
              onClick={() => setFontSize('large')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                fontSize === 'large'
                  ? 'bg-[#2398c2] text-white border-[#2398c2]'
                  : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              {tr('largeSize')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
