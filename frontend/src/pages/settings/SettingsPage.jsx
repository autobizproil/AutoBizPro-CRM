import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useCallback } from 'react'
import client from '../../api/client'
import { integrationsApi } from '../../api/integrations'
import { useAuth } from '../../context/AuthContext'
import { usePreferences } from '../../context/PreferencesContext'
import { translations } from '../../i18n/translations'

// ---------------------------------------------------------------------------
// Toggle switch component — pill-shaped, brand-blue when on
// ---------------------------------------------------------------------------
function ToggleSwitch({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-[#2398c2]' : 'bg-gray-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
          checked ? '-translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------
const TABS = [
  { id: 'general',     label: 'כללי' },
  { id: 'connections', label: 'חיבורים למערכות' },
  { id: 'users',       label: 'משתמשים' },
  { id: 'permissions', label: 'הרשאות' },
  { id: 'labels',      label: 'לייבלים' },
  { id: 'preferences', label: 'העדפות' },
]

// ---------------------------------------------------------------------------
// Shared card wrapper
// ---------------------------------------------------------------------------
function Card({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-6 ${className}`}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared save/test button row
// ---------------------------------------------------------------------------
function SaveRow({ isPending, isSuccess, isError, errorMsg, onTest, testPending, testData }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="bg-[#2398c2] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1d7fa3] disabled:opacity-50 transition-colors duration-150"
        >
          {isPending ? 'שומר...' : 'שמור'}
        </button>
        {onTest && (
          <button
            type="button"
            onClick={onTest}
            disabled={testPending}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors duration-150"
          >
            {testPending ? 'בודק...' : 'בדוק חיבור'}
          </button>
        )}
        {isSuccess && <span className="text-green-600 text-sm">&#10003; נשמר</span>}
      </div>
      {isError && (
        <div className="text-sm px-3 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200">
          {errorMsg ?? 'שגיאה בשמירה'}
        </div>
      )}
      {testData && (
        <div className={`text-sm px-3 py-2 rounded-lg ${testData.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {testData.message}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: כללי (General) — tenant settings + WhatsApp
// ---------------------------------------------------------------------------
function GeneralTab({ tenantData, can, qc }) {
  const [whatsappProvider, setWhatsappProvider] = useState('')
  const [whatsappApiKey, setWhatsappApiKey]     = useState('')

  useEffect(() => {
    if (tenantData) {
      setWhatsappProvider(tenantData.whatsapp_provider ?? '')
      setWhatsappApiKey(tenantData.whatsapp_api_key ?? '')
    }
  }, [tenantData])

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
    <div className="space-y-6 max-w-lg">
      {/* Business info display */}
      {tenantData && (
        <Card>
          <h3 className="font-semibold text-gray-800 mb-4">פרטי עסק</h3>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">שם עסק</p>
              <p className="text-sm text-gray-800">{tenantData.name ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Subdomain</p>
              <p className="text-sm text-gray-800 font-mono">{tenantData.subdomain ?? '—'}</p>
            </div>
          </div>
        </Card>
      )}

      {/* WhatsApp */}
      <Card>
        <h3 className="font-semibold text-gray-800 mb-1">WhatsApp (GREEN-API)</h3>
        <p className="text-xs text-gray-500 mb-4">הגדר ספק WhatsApp לשליחת הודעות אוטומטיות.</p>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ספק</label>
            <select
              value={whatsappProvider}
              onChange={e => setWhatsappProvider(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
              placeholder="הכנס API key..."
            />
          </div>
          {can('users', 'can_update') && (
            <SaveRow
              isPending={saveTenant.isPending}
              isSuccess={saveTenant.isSuccess}
              isError={saveTenant.isError}
              errorMsg={saveTenant.error?.response?.data?.message}
            />
          )}
        </form>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: חיבורים למערכות (Integrations)
// ---------------------------------------------------------------------------
function ConnectionsTab({ integ, can, qc, tenantSubdomain }) {
  // --- Green Invoice state ---
  const [giId, setGiId]           = useState('')
  const [giSecret, setGiSecret]   = useState('')
  const [giSandbox, setGiSandbox] = useState(false)

  // --- Cardcom state ---
  const [cardcomTerminal, setCardcomTerminal]         = useState('')
  const [cardcomApiName, setCardcomApiName]           = useState('')
  const [cardcomApiPassword, setCardcomApiPassword]   = useState('')

  // --- Yesh Invoice state ---
  const [yeshUserKey, setYeshUserKey]     = useState('')
  const [yeshSecretKey, setYeshSecretKey] = useState('')

  // --- PayCall state ---
  const [paycallEnabled, setPaycallEnabled] = useState(false)
  const [paycallDid, setPaycallDid]         = useState('')
  const [paycallSecret, setPaycallSecret]   = useState('')
  const [webhookCopied, setWebhookCopied]   = useState(false)

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
      setPaycallEnabled(integ.paycall_enabled === '1')
      setPaycallDid(integ.paycall_did ?? '')
      setPaycallSecret(integ.paycall_secret ?? '')
    }
  }, [integ])

  // --- Mutations: Green Invoice ---
  const saveInteg = useMutation({
    mutationFn: () => integrationsApi.saveSettings({
      greeninvoice_api_key_id: giId,
      greeninvoice_api_key_secret: giSecret,
      greeninvoice_sandbox: giSandbox ? '1' : '0',
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations-settings'] }),
  })
  const testGi = useMutation({ mutationFn: () => integrationsApi.greenInvoiceTest().then(r => r.data) })

  // --- Mutations: Cardcom ---
  const saveCardcom = useMutation({
    mutationFn: () => integrationsApi.saveSettings({
      cardcom_terminal: cardcomTerminal,
      cardcom_api_name: cardcomApiName,
      cardcom_api_password: cardcomApiPassword,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations-settings'] }),
  })

  // --- Mutations: Yesh Invoice ---
  const saveYesh = useMutation({
    mutationFn: () => integrationsApi.saveSettings({
      yesh_user_key: yeshUserKey,
      yesh_secret_key: yeshSecretKey,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations-settings'] }),
  })
  const testYesh = useMutation({ mutationFn: () => integrationsApi.yeshInvoiceTest().then(r => r.data) })

  // --- Mutations: PayCall ---
  const savePaycall = useMutation({
    mutationFn: () => integrationsApi.saveSettings({
      paycall_did: paycallDid,
      paycall_secret: paycallSecret,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations-settings'] }),
  })

  const savePaycallEnabled = useMutation({
    mutationFn: (val) => integrationsApi.saveSettings({ paycall_enabled: val ? '1' : '0' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations-settings'] }),
  })

  const handlePaycallToggle = (val) => {
    setPaycallEnabled(val)
    savePaycallEnabled.mutate(val)
  }

  const webhookUrl = `${window.location.origin}/api/integrations/paycall/webhook/${tenantSubdomain ?? ''}`

  const handleCopyWebhook = useCallback(() => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setWebhookCopied(true)
      setTimeout(() => setWebhookCopied(false), 2000)
    })
  }, [webhookUrl])

  return (
    <div className="grid grid-cols-1 gap-6 max-w-2xl">

      {/* Green Invoice */}
      <Card>
        <h3 className="font-semibold text-gray-800 mb-1">&#x1F9FE; Green Invoice (חשבוניות)</h3>
        <p className="text-xs text-gray-500 mb-4">הזן את מפתחות ה-API מ-Green Invoice &#x2192; הגדרות &#x2192; API. לאחר מכן ניתן להפיק חשבוניות ישירות מכרטיס ליד.</p>
        <form onSubmit={(e) => { e.preventDefault(); saveInteg.mutate() }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key ID</label>
            <input value={giId} onChange={e => setGiId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
              placeholder="key id..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Secret</label>
            <input type="password" value={giSecret} onChange={e => setGiSecret(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
              placeholder="secret..." />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input type="checkbox" checked={giSandbox} onChange={e => setGiSandbox(e.target.checked)}
              className="rounded border-gray-300 text-[#2398c2] focus:ring-[#2398c2]/30" />
            מצב Sandbox (בדיקות)
          </label>
          {can('users', 'can_update') && (
            <SaveRow
              isPending={saveInteg.isPending}
              isSuccess={saveInteg.isSuccess}
              isError={saveInteg.isError}
              errorMsg={saveInteg.error?.response?.data?.message}
              onTest={() => testGi.mutate()}
              testPending={testGi.isPending}
              testData={testGi.data}
            />
          )}
        </form>
      </Card>

      {/* WhatsApp (GREEN-API) — connection details only; provider settings live in General */}
      {/* Cardcom */}
      <Card>
        <h3 className="font-semibold text-gray-800 mb-1">&#x1F4B3; Cardcom (סליקה)</h3>
        <p className="text-xs text-gray-500 mb-4">הזן את פרטי ה-API של Cardcom כדי לאפשר שליחת עמודי תשלום ישירות מכרטיס ליד.</p>
        <form onSubmit={(e) => { e.preventDefault(); saveCardcom.mutate() }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">מספר טרמינל</label>
            <input value={cardcomTerminal} onChange={e => setCardcomTerminal(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
              placeholder="מספר טרמינל..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם משתמש API</label>
            <input value={cardcomApiName} onChange={e => setCardcomApiName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
              placeholder="שם משתמש..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סיסמת API</label>
            <input type="password" value={cardcomApiPassword} onChange={e => setCardcomApiPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
              placeholder="סיסמה..." />
          </div>
          {can('users', 'can_update') && (
            <SaveRow
              isPending={saveCardcom.isPending}
              isSuccess={saveCardcom.isSuccess}
              isError={saveCardcom.isError}
              errorMsg={saveCardcom.error?.response?.data?.message ?? 'שגיאה בשמירת הגדרות Cardcom'}
            />
          )}
        </form>
      </Card>

      {/* Yesh Invoice */}
      <Card>
        <h3 className="font-semibold text-gray-800 mb-1">&#x1F9FE; Yesh Invoice (חשבוניות)</h3>
        <p className="text-xs text-gray-500 mb-4">הזן את מפתחות ה-API של Yesh Invoice להפקת חשבוניות ישירות מכרטיס ליד.</p>
        <form onSubmit={(e) => { e.preventDefault(); saveYesh.mutate() }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">מפתח משתמש</label>
            <input value={yeshUserKey} onChange={e => setYeshUserKey(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
              placeholder="user key..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">מפתח סודי</label>
            <input type="password" value={yeshSecretKey} onChange={e => setYeshSecretKey(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
              placeholder="secret key..." />
          </div>
          {can('users', 'can_update') && (
            <SaveRow
              isPending={saveYesh.isPending}
              isSuccess={saveYesh.isSuccess}
              isError={saveYesh.isError}
              errorMsg={saveYesh.error?.response?.data?.message ?? 'שגיאה בשמירת הגדרות Yesh Invoice'}
              onTest={() => testYesh.mutate()}
              testPending={testYesh.isPending}
              testData={testYesh.data}
            />
          )}
        </form>
      </Card>

      {/* PayCall */}
      <Card>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-800">&#x1F4DE; PayCall — מרכזייה טלפונית</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{paycallEnabled ? 'פעיל' : 'כבוי'}</span>
            <ToggleSwitch
              checked={paycallEnabled}
              onChange={handlePaycallToggle}
              disabled={savePaycallEnabled.isPending}
            />
          </div>
        </div>
        <p className="text-xs text-gray-500 mb-4">חבר את מרכזיית PayCall לקבלת שיחות נכנסות ויצירת לידים אוטומטית.</p>

        <form onSubmit={(e) => { e.preventDefault(); savePaycall.mutate() }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">DID (מספר נכנסי)</label>
            <input
              value={paycallDid}
              onChange={e => setPaycallDid(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
              placeholder="03-XXXXXXX"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סוד Webhook (אופציונלי)</label>
            <input
              type="password"
              value={paycallSecret}
              onChange={e => setPaycallSecret(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
              placeholder="secret..."
            />
          </div>

          {can('users', 'can_update') && (
            <SaveRow
              isPending={savePaycall.isPending}
              isSuccess={savePaycall.isSuccess}
              isError={savePaycall.isError}
              errorMsg={savePaycall.error?.response?.data?.message ?? 'שגיאה בשמירת הגדרות PayCall'}
            />
          )}

          {/* Webhook URL display */}
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2">Webhook URL (העתק לתוך הגדרות PayCall):</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={webhookUrl}
                dir="ltr"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 bg-gray-50 font-mono focus:outline-none select-all"
                onClick={e => e.target.select()}
              />
              <button
                type="button"
                onClick={handleCopyWebhook}
                className="shrink-0 border border-gray-300 text-gray-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors duration-150"
              >
                {webhookCopied ? '&#x2713; הועתק' : 'העתק'}
              </button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: משתמשים (Users) — placeholder
// ---------------------------------------------------------------------------
function UsersTab() {
  return (
    <div className="max-w-lg">
      <Card>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">ניהול משתמשים</p>
          <p className="text-xs text-gray-400">בקרוב</p>
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: הרשאות (Permissions) — placeholder
// ---------------------------------------------------------------------------
function PermissionsTab() {
  return (
    <div className="max-w-lg">
      <Card>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">ניהול הרשאות</p>
          <p className="text-xs text-gray-400">בקרוב</p>
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: לייבלים (Labels) — placeholder
// ---------------------------------------------------------------------------
function LabelsTab() {
  return (
    <div className="max-w-lg">
      <Card>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">ניהול לייבלים</p>
          <p className="text-xs text-gray-400">בקרוב</p>
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: העדפות (Preferences)
// ---------------------------------------------------------------------------
function PreferencesTab({ lang, theme, fontSize, setLang, setTheme, setFontSize, tr }) {
  return (
    <div className="max-w-lg">
      <Card>
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-5">&#x2699;&#xFE0F; {tr('preferences')}</h3>

        {/* Language */}
        <div className="mb-5">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{tr('language')}</p>
          <div className="flex gap-2">
            {[['he', tr('hebrew')], ['en', tr('english')]].map(([val, lbl]) => (
              <button
                key={val}
                type="button"
                onClick={() => setLang(val)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors duration-150 ${
                  lang === val
                    ? 'bg-[#2398c2] text-white border-[#2398c2]'
                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div className="mb-5">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{lang === 'en' ? 'Theme' : 'מצב תצוגה'}</p>
          <div className="flex gap-2">
            {[['light', `☀️ ${tr('lightMode')}`], ['dark', `🌙 ${tr('darkMode')}`]].map(([val, lbl]) => (
              <button
                key={val}
                type="button"
                onClick={() => setTheme(val)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors duration-150 ${
                  theme === val
                    ? 'bg-[#2398c2] text-white border-[#2398c2]'
                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Font size */}
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{tr('accessibility')} — {tr('fontSize')}</p>
          <div className="flex gap-2">
            {[['normal', tr('normalSize')], ['large', tr('largeSize')]].map(([val, lbl]) => (
              <button
                key={val}
                type="button"
                onClick={() => setFontSize(val)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors duration-150 ${
                  fontSize === val
                    ? 'bg-[#2398c2] text-white border-[#2398c2]'
                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------
export default function SettingsPage() {
  const { can }    = useAuth()
  const qc         = useQueryClient()
  const { theme, lang, fontSize, setTheme, setLang, setFontSize } = usePreferences()
  const tr = (key) => translations[lang]?.[key] ?? key

  const [activeTab, setActiveTab] = useState('general')

  const { data: tenantData } = useQuery({
    queryKey: ['settings-tenant'],
    queryFn:  () => client.get('/settings/tenant').then(r => r.data.data),
  })

  const { data: integ } = useQuery({
    queryKey: ['integrations-settings'],
    queryFn:  () => integrationsApi.getSettings().then(r => r.data.data),
  })

  const tenantSubdomain = tenantData?.subdomain ?? ''

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-6">הגדרות</h2>

      {/* Tab bar */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-150 focus:outline-none ${
                activeTab === tab.id
                  ? 'border-[#2398c2] text-[#2398c2]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab panels */}
      {activeTab === 'general' && (
        <GeneralTab tenantData={tenantData} can={can} qc={qc} />
      )}
      {activeTab === 'connections' && (
        <ConnectionsTab integ={integ} can={can} qc={qc} tenantSubdomain={tenantSubdomain} />
      )}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'permissions' && <PermissionsTab />}
      {activeTab === 'labels' && <LabelsTab />}
      {activeTab === 'preferences' && (
        <PreferencesTab
          lang={lang}
          theme={theme}
          fontSize={fontSize}
          setLang={setLang}
          setTheme={setTheme}
          setFontSize={setFontSize}
          tr={tr}
        />
      )}
    </div>
  )
}
