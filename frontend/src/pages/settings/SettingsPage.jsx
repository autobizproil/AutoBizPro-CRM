import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useCallback, useRef } from 'react'
import client from '../../api/client'
import { settingsApi } from '../../api/settings'
import { usersApi } from '../../api/users'
import { integrationsApi } from '../../api/integrations'
import { customFieldsApi, FIELD_TYPE_LABELS, ENTITIES, CREATABLE_TYPES } from '../../api/customFields'
import { recordTypesApi, RECORD_TYPE_ICONS } from '../../api/recordTypes'
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
      dir="ltr"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-[#2398c2]' : 'bg-gray-200 dark:bg-gray-600'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
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
  { id: 'labels',      label: 'הגדרות רשומות' },
  { id: 'preferences', label: 'העדפות' },
]

// ---------------------------------------------------------------------------
// Shared card wrapper
// ---------------------------------------------------------------------------
function Card({ children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 ${className}`}>
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
            className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors duration-150"
          >
            {testPending ? 'בודק...' : 'בדוק חיבור'}
          </button>
        )}
        {isSuccess && <span className="text-green-600 dark:text-green-400 text-sm">✓ נשמר</span>}
      </div>
      {isError && (
        <div className="text-sm px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700">
          {errorMsg ?? 'שגיאה בשמירה'}
        </div>
      )}
      {testData && (
        <div className={`text-sm px-3 py-2 rounded-lg ${testData.success ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700'}`}>
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
  const [logoError, setLogoError]               = useState('')
  const logoInputRef = useRef(null)

  const invalidateTenant = () => {
    qc.invalidateQueries({ queryKey: ['settings-tenant'] })
    qc.invalidateQueries({ queryKey: ['tenant-settings'] }) // topnav logo
  }

  const uploadLogo = useMutation({
    mutationFn: (file) => settingsApi.uploadLogo(file),
    onSuccess:  () => { setLogoError(''); invalidateTenant() },
    onError:    (err) => setLogoError(err.response?.data?.message ?? 'שגיאה בהעלאת הלוגו'),
  })

  const deleteLogo = useMutation({
    mutationFn: () => settingsApi.deleteLogo(),
    onSuccess:  invalidateTenant,
  })

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
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">פרטי עסק</h3>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">שם עסק</p>
              <p className="text-sm text-gray-800 dark:text-gray-100">{tenantData.name ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Subdomain</p>
              <p className="text-sm text-gray-800 font-mono">{tenantData.subdomain ?? '—'}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Logo */}
      <Card>
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">לוגו העסק</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">מוצג בסרגל העליון במקום לוגו ברירת המחדל. PNG/JPG/WebP עד 1MB.</p>
        <div className="flex items-center gap-4">
          <div className="w-20 h-14 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
            {tenantData?.settings?.logo
              ? <img src={tenantData.settings.logo} alt="לוגו" className="max-h-12 max-w-[72px] object-contain" />
              : <span className="text-xs text-gray-400">אין לוגו</span>}
          </div>
          {can('users', 'can_update') && (
            <div className="flex gap-2">
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo.mutate(f); e.target.value = '' }} />
              <button type="button" onClick={() => logoInputRef.current?.click()} disabled={uploadLogo.isPending}
                className="bg-[#2398c2] hover:bg-[#1d7fa3] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
                {uploadLogo.isPending ? 'מעלה...' : 'העלה לוגו'}
              </button>
              {tenantData?.settings?.logo && (
                <button type="button" onClick={() => deleteLogo.mutate()} disabled={deleteLogo.isPending}
                  className="border border-red-200 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 px-3 py-2 rounded-lg text-sm">
                  הסר
                </button>
              )}
            </div>
          )}
        </div>
        {logoError && <p className="text-xs text-red-500 mt-2">{logoError}</p>}
      </Card>

      {/* WhatsApp */}
      <Card>
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">WhatsApp (GREEN-API)</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">הגדר ספק WhatsApp לשליחת הודעות אוטומטיות.</p>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ספק</label>
            <select
              value={whatsappProvider}
              onChange={e => setWhatsappProvider(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
            >
              <option value="">בחר ספק...</option>
              <option value="360dialog">360dialog</option>
              <option value="ultramsg">UltraMsg</option>
              <option value="twilio">Twilio</option>
              <option value="smartsend">SmartSend</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Key</label>
            <input
              type="password"
              value={whatsappApiKey}
              onChange={e => setWhatsappApiKey(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
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
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">&#x1F9FE; Green Invoice (חשבוניות)</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">הזן את מפתחות ה-API מ-Green Invoice &#x2192; הגדרות &#x2192; API. לאחר מכן ניתן להפיק חשבוניות ישירות מכרטיס ליד.</p>
        <form onSubmit={(e) => { e.preventDefault(); saveInteg.mutate() }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Key ID</label>
            <input value={giId} onChange={e => setGiId(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
              placeholder="key id..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Secret</label>
            <input type="password" value={giSecret} onChange={e => setGiSecret(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
              placeholder="secret..." />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
            <input type="checkbox" checked={giSandbox} onChange={e => setGiSandbox(e.target.checked)}
              className="rounded border-gray-300 accent-[#2398c2] focus:ring-[#2398c2]/30" />
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
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">&#x1F4B3; Cardcom (סליקה)</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">הזן את פרטי ה-API של Cardcom כדי לאפשר שליחת עמודי תשלום ישירות מכרטיס ליד.</p>
        <form onSubmit={(e) => { e.preventDefault(); saveCardcom.mutate() }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מספר טרמינל</label>
            <input value={cardcomTerminal} onChange={e => setCardcomTerminal(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
              placeholder="מספר טרמינל..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שם משתמש API</label>
            <input value={cardcomApiName} onChange={e => setCardcomApiName(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
              placeholder="שם משתמש..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סיסמת API</label>
            <input type="password" value={cardcomApiPassword} onChange={e => setCardcomApiPassword(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
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
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">&#x1F9FE; Yesh Invoice (חשבוניות)</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">הזן את מפתחות ה-API של Yesh Invoice להפקת חשבוניות ישירות מכרטיס ליד.</p>
        <form onSubmit={(e) => { e.preventDefault(); saveYesh.mutate() }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מפתח משתמש</label>
            <input value={yeshUserKey} onChange={e => setYeshUserKey(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
              placeholder="user key..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מפתח סודי</label>
            <input type="password" value={yeshSecretKey} onChange={e => setYeshSecretKey(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
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
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">&#x1F4DE; PayCall — מרכזייה טלפונית</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{paycallEnabled ? 'פעיל' : 'כבוי'}</span>
            <ToggleSwitch
              checked={paycallEnabled}
              onChange={handlePaycallToggle}
              disabled={savePaycallEnabled.isPending}
            />
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">חבר את מרכזיית PayCall לקבלת שיחות נכנסות ויצירת לידים אוטומטית.</p>

        <form onSubmit={(e) => { e.preventDefault(); savePaycall.mutate() }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">DID (מספר נכנסי)</label>
            <input
              value={paycallDid}
              onChange={e => setPaycallDid(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
              placeholder="03-XXXXXXX"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סוד Webhook (אופציונלי)</label>
            <input
              type="password"
              value={paycallSecret}
              onChange={e => setPaycallSecret(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
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
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Webhook URL (העתק לתוך הגדרות PayCall):</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={webhookUrl}
                dir="ltr"
                className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 font-mono focus:outline-none select-all"
                onClick={e => e.target.select()}
              />
              <button
                type="button"
                onClick={handleCopyWebhook}
                className="shrink-0 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-3 py-2 rounded-lg text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150"
              >
                {webhookCopied ? '✓ הועתק' : 'העתק'}
              </button>
            </div>
          </div>
        </form>
      </Card>

      {/* Facebook Lead Ads */}
      <FacebookCard integ={integ} qc={qc} can={can} tenantSubdomain={tenantSubdomain} />

      {/* Voicenter */}
      <VoicenterCard integ={integ} qc={qc} can={can} tenantSubdomain={tenantSubdomain} />

      {/* Google Sheets */}
      <GoogleSheetsCard integ={integ} qc={qc} can={can} />

      {/* Outgoing Webhook */}
      <OutgoingWebhookCard integ={integ} qc={qc} can={can} />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
//  Facebook Lead Ads card
// ──────────────────────────────────────────────────────────────────────────────
function FacebookCard({ integ, qc, can, tenantSubdomain }) {
  const [appId, setAppId]           = useState('')
  const [appSecret, setAppSecret]   = useState('')
  const [pageId, setPageId]         = useState('')
  const [verifyToken, setVerify]    = useState('')
  const [copied, setCopied]         = useState(false)

  useEffect(() => {
    if (integ) {
      setAppId(integ.facebook_app_id ?? '')
      setAppSecret(integ.facebook_app_secret ?? '')
      setPageId(integ.facebook_page_id ?? '')
      setVerify(integ.facebook_verify_token ?? '')
    }
  }, [integ])

  const save = useMutation({
    mutationFn: () => integrationsApi.saveSettings({
      facebook_app_id: appId, facebook_app_secret: appSecret,
      facebook_page_id: pageId, facebook_verify_token: verifyToken,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations-settings'] }),
  })

  const webhookUrl = `${window.location.origin}/api/integrations/facebook/webhook/${tenantSubdomain ?? ''}`

  const INPUT = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]'

  return (
    <Card>
      <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">📘 Facebook Lead Ads</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">קבל לידים ממודעות פייסבוק אוטומטית. צור אפליקציית Meta, הגדר webhook ב-Meta Business Suite.</p>
      <form onSubmit={e => { e.preventDefault(); save.mutate() }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">App ID</label>
            <input value={appId} onChange={e => setAppId(e.target.value)} placeholder="123456789..." className={INPUT} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">App Secret</label>
            <input type="password" value={appSecret} onChange={e => setAppSecret(e.target.value)} placeholder="secret..." className={INPUT} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Page ID</label>
            <input value={pageId} onChange={e => setPageId(e.target.value)} placeholder="page id..." className={INPUT} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Verify Token</label>
            <input value={verifyToken} onChange={e => setVerify(e.target.value)} placeholder="my_verify_token" className={INPUT} />
          </div>
        </div>
        <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Webhook URL (הכנס ב-Meta Business Suite):</p>
          <div className="flex gap-2">
            <input readOnly value={webhookUrl} dir="ltr" className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 font-mono" onClick={e => e.target.select()} />
            <button type="button" onClick={() => { navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
              className="shrink-0 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-3 py-2 rounded-lg text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700">
              {copied ? '✓ הועתק' : 'העתק'}
            </button>
          </div>
        </div>
        {can('users', 'can_update') && (
          <SaveRow isPending={save.isPending} isSuccess={save.isSuccess} isError={save.isError} errorMsg={save.error?.response?.data?.message} />
        )}
      </form>
    </Card>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
//  Voicenter card
// ──────────────────────────────────────────────────────────────────────────────
function VoicenterCard({ integ, qc, can, tenantSubdomain }) {
  const [accountId, setAccountId]   = useState('')
  const [apiToken, setApiToken]     = useState('')
  const [webhookSecret, setSecret]  = useState('')
  const [copied, setCopied]         = useState(false)

  useEffect(() => {
    if (integ) {
      setAccountId(integ.voicenter_account_id ?? '')
      setApiToken(integ.voicenter_api_token ?? '')
      setSecret(integ.voicenter_webhook_secret ?? '')
    }
  }, [integ])

  const save = useMutation({
    mutationFn: () => integrationsApi.saveSettings({
      voicenter_account_id: accountId, voicenter_api_token: apiToken, voicenter_webhook_secret: webhookSecret,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations-settings'] }),
  })

  const webhookUrl = `${window.location.origin}/api/integrations/voicenter/webhook/${tenantSubdomain ?? ''}`

  const INPUT = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]'

  return (
    <Card>
      <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">📞 Voicenter — מרכזייה</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">חבר מרכזיית Voicenter לקבלת שיחות נכנסות/יוצאות ויצירת לידים ופעילויות אוטומטית.</p>
      <form onSubmit={e => { e.preventDefault(); save.mutate() }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Account ID</label>
            <input value={accountId} onChange={e => setAccountId(e.target.value)} placeholder="account id..." className={INPUT} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Token</label>
            <input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} placeholder="token..." className={INPUT} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Webhook Secret (אופציונלי)</label>
          <input type="password" value={webhookSecret} onChange={e => setSecret(e.target.value)} placeholder="secret..." className={INPUT} />
        </div>
        <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Webhook URL (הכנס בהגדרות Voicenter):</p>
          <div className="flex gap-2">
            <input readOnly value={webhookUrl} dir="ltr" className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 font-mono" onClick={e => e.target.select()} />
            <button type="button" onClick={() => { navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
              className="shrink-0 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-3 py-2 rounded-lg text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700">
              {copied ? '✓ הועתק' : 'העתק'}
            </button>
          </div>
        </div>
        {can('users', 'can_update') && (
          <SaveRow isPending={save.isPending} isSuccess={save.isSuccess} isError={save.isError} errorMsg={save.error?.response?.data?.message} />
        )}
      </form>
    </Card>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
//  Google Sheets card
// ──────────────────────────────────────────────────────────────────────────────
function GoogleSheetsCard({ integ, qc, can }) {
  const [sheetsId, setSheetsId]   = useState('')
  const [saJson, setSaJson]       = useState('')
  const [exportResult, setResult] = useState(null)

  useEffect(() => {
    if (integ) {
      setSheetsId(integ.google_sheets_id ?? '')
      setSaJson(integ.google_service_account_json ? '****' : '')
    }
  }, [integ])

  const save = useMutation({
    mutationFn: () => integrationsApi.saveSettings({
      google_sheets_id: sheetsId,
      ...(saJson && !saJson.startsWith('****') ? { google_service_account_json: saJson } : {}),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations-settings'] }),
  })

  const exportMut = useMutation({
    mutationFn: () => integrationsApi.googleSheetsExport().then(r => r.data),
    onSuccess: (data) => setResult(data),
  })

  const INPUT = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]'

  return (
    <Card>
      <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">📊 Google Sheets — ייצוא לידים</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">ייצא את כל הלידים לגיליון Google Sheets דרך Service Account. הגדר ב-Google Cloud Console.</p>
      <form onSubmit={e => { e.preventDefault(); save.mutate() }} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sheet ID</label>
          <input value={sheetsId} onChange={e => setSheetsId(e.target.value)} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" dir="ltr" className={INPUT} />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">מתוך URL: docs.google.com/spreadsheets/d/<b>SHEET_ID</b>/edit</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Service Account JSON</label>
          <textarea value={saJson} onChange={e => setSaJson(e.target.value)} rows={3} placeholder={`{"type":"service_account","client_email":"...","private_key":"..."}`} dir="ltr"
            className={INPUT + ' resize-none font-mono text-xs'} />
        </div>
        {can('users', 'can_update') && (
          <div className="flex gap-2 items-center flex-wrap">
            <SaveRow isPending={save.isPending} isSuccess={save.isSuccess} isError={save.isError} errorMsg={save.error?.response?.data?.message} />
            <button type="button" onClick={() => exportMut.mutate()} disabled={exportMut.isPending || !sheetsId}
              className="bg-[#b1e239] hover:bg-[#9ecf30] text-gray-900 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40">
              {exportMut.isPending ? 'מייצא...' : '📤 ייצא עכשיו'}
            </button>
          </div>
        )}
        {exportResult && (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 text-sm px-3 py-2 rounded-lg">
            ✓ יוצאו {exportResult.appended} לידים לגיליון
          </div>
        )}
        {exportMut.isError && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-sm px-3 py-2 rounded-lg">
            {exportMut.error?.response?.data?.message ?? 'שגיאה בייצוא'}
          </div>
        )}
      </form>
    </Card>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
//  Outgoing Webhook card (Make / n8n / Zapier)
// ──────────────────────────────────────────────────────────────────────────────
function OutgoingWebhookCard({ integ, qc, can }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (integ) setUrl(integ.outgoing_webhook_url ?? '')
  }, [integ])

  const save = useMutation({
    mutationFn: () => integrationsApi.saveSettings({ outgoing_webhook_url: url }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['integrations-settings'] }),
  })

  const INPUT = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]'

  return (
    <Card>
      <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">🔗 Webhook יוצא (Make / n8n / Zapier)</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">שלח אוטומטית POST עם פרטי הליד בכל יצירה / עדכון / שינוי סטטוס. הדבק את ה-URL מ-Make/n8n.</p>
      <form onSubmit={e => { e.preventDefault(); save.mutate() }} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Webhook URL</label>
          <input value={url} onChange={e => setUrl(e.target.value)} dir="ltr"
            placeholder="https://hook.eu1.make.com/xxxxxxxx" className={INPUT} />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">אירועים: lead_created · lead_updated · status_changed · stage_changed</p>
        </div>
        {can('users', 'can_update') && (
          <SaveRow isPending={save.isPending} isSuccess={save.isSuccess} isError={save.isError} errorMsg={save.error?.response?.data?.message} />
        )}
      </form>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Tab: משתמשים (Users)
// ---------------------------------------------------------------------------
const ROLE_LABELS = { admin: 'מנהל', manager: 'מנג\'ר', agent: 'נציג' }

function UsersTab({ can, currentUser }) {
  const qc = useQueryClient()

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn:  () => usersApi.list().then(r => r.data.data),
  })

  const canCreate = can('users', 'can_create')
  const canUpdate = can('users', 'can_update')

  return (
    <div className="max-w-3xl">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">ניהול משתמשים</h3>
        </div>

        {isLoading && <p className="text-sm text-gray-500 dark:text-gray-400">טוען...</p>}

        {!isLoading && (
          <table className="w-full text-sm text-right">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                <th className="py-2 font-medium">שם</th>
                <th className="py-2 font-medium">אימייל</th>
                <th className="py-2 font-medium">תפקיד</th>
                <th className="py-2 font-medium">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map(u => (
                <tr key={u.id} className="border-b border-gray-100 dark:border-gray-700/50">
                  <td className="py-2 text-gray-800 dark:text-gray-100">{u.name}</td>
                  <td className="py-2 text-gray-600 dark:text-gray-300" dir="ltr">{u.email}</td>
                  <td className="py-2 text-gray-700 dark:text-gray-300">{ROLE_LABELS[u.role] ?? u.role}</td>
                  <td className="py-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      u.status === 'active'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {u.status === 'active' ? 'פעיל' : 'לא פעיל'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
          <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ניהול הרשאות</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">בקרוב</p>
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: לייבלים (Labels) — placeholder
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Tab: לייבלים → replaced by full custom fields manager (שדות מותאמים)
// ---------------------------------------------------------------------------
const FIELD_TYPES_CREATABLE = CREATABLE_TYPES

const TYPE_ICON = {
  text: 'Aa', textarea: '¶', number: '#', select: '☰', date: '📅',
  checkbox: '☑', url: '🔗', phone: '📞', email: '@', datetime: '🕐', lookup: '🔍',
}

function LabelsTab() {
  const qc = useQueryClient()
  const { can } = useAuth()
  const canManage = can('users', 'can_update')

  const [entity, setEntity]         = useState('leads')
  const [showModal, setShowModal]   = useState(false)
  const [draft, setDraft]           = useState({ label: '', field_type: 'text', options: '', required: false })
  const [createError, setCreateError] = useState('')
  const [renameId, setRenameId]     = useState(null)
  const [renameVal, setRenameVal]   = useState('')
  const [optsId, setOptsId]         = useState(null)
  const [optsVal, setOptsVal]       = useState('')
  const [dragIdx, setDragIdx]       = useState(null)

  // Custom record types — user-defined entities beyond the fixed 4
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [typeDraft, setTypeDraft]   = useState({ label: '', label_singular: '', icon: RECORD_TYPE_ICONS[0] })
  const [typeError, setTypeError]  = useState('')

  const { data: recordTypes = [] } = useQuery({
    queryKey: ['record-types'],
    queryFn:  () => recordTypesApi.list().then(r => r.data.data),
  })

  const allEntities = [
    ...ENTITIES,
    ...recordTypes.map(rt => ({ id: rt.slug, label: rt.label, custom: true, recordTypeId: rt.id, recordCount: rt.records_count })),
  ]

  const createType = useMutation({
    mutationFn: (d) => recordTypesApi.create(d),
    onSuccess:  (res) => {
      qc.invalidateQueries({ queryKey: ['record-types'] })
      setShowTypeModal(false)
      setTypeDraft({ label: '', label_singular: '', icon: RECORD_TYPE_ICONS[0] })
      setTypeError('')
      setEntity(res.data.data.slug)
    },
    onError: (err) => setTypeError(err.response?.data?.message ?? 'שגיאה ביצירת סוג הרשומה'),
  })

  const deleteType = useMutation({
    mutationFn: (id) => recordTypesApi.destroy(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['record-types'] })
      setEntity('leads')
    },
  })

  const handleCreateType = (e) => {
    e.preventDefault()
    setTypeError('')
    if (!typeDraft.label.trim()) return
    createType.mutate({
      label: typeDraft.label.trim(),
      label_singular: typeDraft.label_singular.trim() || undefined,
      icon: typeDraft.icon,
    })
  }

  const { data: fields = [], isLoading, error: listError } = useQuery({
    queryKey: ['custom-fields', entity],
    queryFn:  () => customFieldsApi.list(entity).then(r => r.data.data),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['custom-fields', entity] })

  const createField = useMutation({
    mutationFn: (d) => customFieldsApi.create(entity, d),
    onSuccess:  () => { invalidate(); setShowModal(false); resetDraft() },
    onError: (err) => setCreateError(
      err.response?.data?.message
      ?? Object.values(err.response?.data?.errors ?? {})[0]?.[0]
      ?? 'שגיאה בשמירה'),
  })
  const updateField  = useMutation({
    mutationFn: ({ id, data }) => customFieldsApi.update(id, data),
    onSuccess: invalidate,
  })
  const reorderField = useMutation({
    mutationFn: (ids) => customFieldsApi.reorder(entity, ids),
    onSuccess: invalidate,
  })
  const deleteField  = useMutation({
    mutationFn: (id) => customFieldsApi.destroy(id),
    onSuccess: invalidate,
  })

  function resetDraft() {
    setDraft({ label: '', field_type: 'text', options: '', required: false })
    setCreateError('')
  }

  const parsedOptions = draft.options
    ? draft.options.split('\n').map(s => s.trim()).filter(Boolean)
    : []

  function handleCreate(e) {
    e.preventDefault()
    const payload = {
      label:      draft.label.trim(),
      field_type: draft.field_type,
      required:   draft.required,
      ...(draft.field_type === 'select' ? { options: parsedOptions } : {}),
    }
    if (!payload.label) return
    createField.mutate(payload)
  }

  const commitRename = (f) => {
    setRenameId(null)
    const label = renameVal.trim()
    if (label && label !== f.label) updateField.mutate({ id: f.id, data: { label } })
  }

  const commitOptions = (f) => {
    setOptsId(null)
    const options = optsVal.split('\n').map(s => s.trim()).filter(Boolean)
    updateField.mutate({ id: f.id, data: { options } })
  }

  const move = (idx, dir) => {
    const ids = fields.map(f => f.id)
    const j = idx + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[idx], ids[j]] = [ids[j], ids[idx]]
    reorderField.mutate(ids)
  }

  const handleDrop = (dropIdx) => {
    if (dragIdx === null || dragIdx === dropIdx) { setDragIdx(null); return }
    const ids = fields.map(f => f.id)
    const [moved] = ids.splice(dragIdx, 1)
    ids.splice(dropIdx, 0, moved)
    reorderField.mutate(ids)
    setDragIdx(null)
  }

  const INPUT = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]'

  if (listError) return (
    <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-sm px-4 py-3 rounded-xl max-w-xl">
      שגיאה בטעינת השדות: {listError.response?.data?.message ?? listError.message}
    </div>
  )

  return (
    <div className="max-w-4xl">
      {/* Entity tabs */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/50 rounded-xl p-1 w-fit flex-wrap">
          {allEntities.map(en => (
            <button key={en.id} onClick={() => setEntity(en.id)}
              className={`group/tab relative px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                entity === en.id
                  ? 'bg-white dark:bg-gray-800 text-[#2398c2] shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}>
              {en.label}
              {en.custom && canManage && (
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`למחוק את סוג הרשומה "${en.label}"? כל הרשומות והשדות שלו יימחקו לצמיתות.`)) deleteType.mutate(en.recordTypeId)
                  }}
                  className="mr-1.5 inline-flex opacity-0 group-hover/tab:opacity-100 text-gray-300 hover:text-red-500 transition-opacity"
                  title="מחק סוג רשומה">×</span>
              )}
            </button>
          ))}
        </div>
        {canManage && (
          <button onClick={() => { setTypeError(''); setShowTypeModal(true) }}
            className="border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-[#2398c2] hover:text-[#2398c2] px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
            + סוג רשומה
          </button>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            שדות — {allEntities.find(e => e.id === entity)?.label}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            שנה שם, הסתר וסדר כל שדה. שדות מערכת לא ניתנים למחיקה; שדות מותאמים — כן.
          </p>
        </div>
        {canManage && (
          <button onClick={() => { resetDraft(); setShowModal(true) }}
            className="bg-[#2398c2] hover:bg-[#1d7fa3] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm">
            <span className="text-lg leading-none">+</span> הוסף שדה
          </button>
        )}
      </div>

      {/* Fields table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 text-right">
              <th className="px-3 py-3 w-16"></th>
              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">שם שדה</th>
              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">סוג</th>
              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">אפשרויות</th>
              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400 w-24">מוצג</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">טוען...</td></tr>
            )}
            {fields.map((f, idx) => (
              <tr key={f.id}
                draggable={canManage}
                onDragStart={() => setDragIdx(idx)}
                onDragOver={e => { if (canManage) e.preventDefault() }}
                onDrop={() => canManage && handleDrop(idx)}
                onDragEnd={() => setDragIdx(null)}
                className={`transition-colors ${f.hidden ? 'opacity-50' : ''} ${dragIdx === idx ? 'opacity-30' : ''} ${f.is_system ? 'bg-gray-50/50 dark:bg-gray-700/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}>
                {/* Reorder */}
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {canManage && (
                    <span className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-[#2398c2] select-none text-base leading-none" title="גרור לשינוי סדר">
                      ⠿
                    </span>
                  )}
                </td>
                {/* Label — inline rename */}
                <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">
                  {renameId === f.id ? (
                    <input autoFocus value={renameVal} dir="auto" lang="he"
                      onChange={e => setRenameVal(e.target.value)}
                      onBlur={() => commitRename(f)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') setRenameId(null)
                      }}
                      className="border border-[#2398c2] rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-700 focus:outline-none w-44" />
                  ) : (
                    <span className="group/lbl flex items-center gap-1.5">
                      <span className="w-6 text-center text-xs text-gray-400">{TYPE_ICON[f.field_type] ?? 'Aa'}</span>
                      {f.label}
                      {f.is_system && <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded font-mono">מערכת</span>}
                      {canManage && (
                        <button onClick={() => { setRenameId(f.id); setRenameVal(f.label) }}
                          className="opacity-0 group-hover/lbl:opacity-100 text-gray-300 hover:text-[#2398c2] transition-opacity" title="שנה שם">
                          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>
                          </svg>
                        </button>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">{FIELD_TYPE_LABELS[f.field_type] ?? f.field_type}</td>
                {/* Options — inline edit for custom select fields */}
                <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs max-w-[200px]">
                  {f.field_type === 'select' ? (
                    optsId === f.id ? (
                      <textarea autoFocus rows={3} value={optsVal}
                        onChange={e => setOptsVal(e.target.value)}
                        onBlur={() => commitOptions(f)}
                        onKeyDown={e => { if (e.key === 'Escape') setOptsId(null) }}
                        className="border border-[#2398c2] rounded-md px-2 py-1 text-xs bg-white dark:bg-gray-700 focus:outline-none w-full resize-none" />
                    ) : (
                      <button disabled={!canManage || f.is_system}
                        onClick={() => { setOptsId(f.id); setOptsVal((f.options ?? []).join('\n')) }}
                        className="text-right hover:text-[#2398c2] disabled:cursor-default truncate block w-full" title="ערוך אפשרויות">
                        {f.options?.length ? f.options.join(', ') : 'הוסף אפשרויות...'}
                      </button>
                    )
                  ) : '—'}
                </td>
                {/* Hidden toggle */}
                <td className="px-4 py-2.5">
                  {canManage && (
                    <button onClick={() => updateField.mutate({ id: f.id, data: { hidden: !f.hidden } })}
                      title={f.hidden ? 'הצג שדה' : 'הסתר שדה'}
                      className={`text-lg leading-none ${f.hidden ? 'text-gray-300' : 'text-[#2398c2]'}`}>
                      {f.hidden ? '🙈' : '👁'}
                    </button>
                  )}
                </td>
                {/* Delete (custom only) */}
                <td className="px-4 py-2.5">
                  {canManage && !f.is_system && (
                    <button
                      onClick={() => { if (confirm(`למחוק את השדה "${f.label}"? הנתונים ילכו לאיבוד.`)) deleteField.mutate(f.id) }}
                      className="text-gray-300 dark:text-gray-600 hover:text-red-500 text-lg leading-none">×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                הוסף שדה — {allEntities.find(e => e.id === entity)?.label}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-4 space-y-4">
              {createError && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-sm px-3 py-2 rounded-lg">
                  {createError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שם השדה (תצוגה) <span className="text-red-500">*</span></label>
                <input required value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
                  placeholder="לדוגמה: תקציב, שם חברה, מספר רישיון..." dir="auto" lang="he"
                  className={INPUT} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סוג שדה</label>
                <div className="grid grid-cols-3 gap-2">
                  {FIELD_TYPES_CREATABLE.map(t => (
                    <button key={t} type="button"
                      onClick={() => setDraft(d => ({ ...d, field_type: t }))}
                      className={`py-2 px-2 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                        draft.field_type === t
                          ? 'border-[#2398c2] bg-[#2398c2]/10 text-[#2398c2]'
                          : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}>
                      <span className="opacity-60">{TYPE_ICON[t]}</span>
                      {FIELD_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
              {draft.field_type === 'select' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">אפשרויות לבחירה (שורה אחת לאפשרות)</label>
                  <textarea value={draft.options}
                    onChange={e => setDraft(d => ({ ...d, options: e.target.value }))}
                    rows={4} placeholder={"אפשרות א\nאפשרות ב\nאפשרות ג"} dir="auto" lang="he"
                    className={INPUT + ' resize-none'} />
                  {parsedOptions.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">{parsedOptions.length} אפשרויות</p>
                  )}
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                <input type="checkbox" checked={draft.required} onChange={e => setDraft(d => ({ ...d, required: e.target.checked }))}
                  className="rounded border-gray-300 accent-[#2398c2]" />
                שדה חובה
              </label>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={createField.isPending || !draft.label.trim()}
                  className="flex-1 bg-[#2398c2] hover:bg-[#1d7fa3] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
                  {createField.isPending ? 'שומר...' : 'צור שדה'}
                </button>
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create record type modal */}
      {showTypeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl" onClick={() => setShowTypeModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">סוג רשומה חדש</h2>
              <button onClick={() => setShowTypeModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleCreateType} className="px-6 py-4 space-y-4">
              {typeError && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-sm px-3 py-2 rounded-lg">
                  {typeError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שם (רבים) <span className="text-red-500">*</span></label>
                <input required value={typeDraft.label} onChange={e => setTypeDraft(d => ({ ...d, label: e.target.value }))}
                  placeholder="לדוגמה: חשבוניות מס, קבלות, רכבים..." dir="auto" lang="he"
                  className={INPUT} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שם (יחיד)</label>
                <input value={typeDraft.label_singular} onChange={e => setTypeDraft(d => ({ ...d, label_singular: e.target.value }))}
                  placeholder="לדוגמה: חשבונית מס, קבלה, רכב..." dir="auto" lang="he"
                  className={INPUT} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">אייקון</label>
                <div className="grid grid-cols-6 gap-2">
                  {RECORD_TYPE_ICONS.map(icon => (
                    <button key={icon} type="button" onClick={() => setTypeDraft(d => ({ ...d, icon }))}
                      className={`text-lg py-2 rounded-lg border transition-colors ${
                        typeDraft.icon === icon
                          ? 'border-[#2398c2] bg-[#2398c2]/10'
                          : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                לאחר היצירה תוכל להוסיף שדות משלך (בדיוק כמו ברשומות אחרות) ותופיע קישור בסרגל הניווט העליון.
              </p>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={createType.isPending || !typeDraft.label.trim()}
                  className="flex-1 bg-[#2398c2] hover:bg-[#1d7fa3] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
                  {createType.isPending ? 'יוצר...' : 'צור סוג רשומה'}
                </button>
                <button type="button" onClick={() => setShowTypeModal(false)}
                  className="px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}
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
  const { can, user } = useAuth()
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
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">הגדרות</h2>

      {/* Tab bar */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-150 focus:outline-none ${
                activeTab === tab.id
                  ? 'border-[#2398c2] text-[#2398c2]'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300'
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
      {activeTab === 'users' && <UsersTab can={can} currentUser={user} />}
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
