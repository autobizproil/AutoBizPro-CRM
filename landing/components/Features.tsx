import { getTranslations } from 'next-intl/server'

const FEATURES = [
  { icon: '🎯', titleKey: 'leads_title',        descKey: 'leads_desc' },
  { icon: '⚡', titleKey: 'automations_title',   descKey: 'automations_desc' },
  { icon: '👥', titleKey: 'customers_title',     descKey: 'customers_desc' },
  { icon: '🔗', titleKey: 'integrations_title',  descKey: 'integrations_desc' },
] as const

export default async function Features() {
  const t = await getTranslations('features')

  return (
    <section id="features" className="bg-bg px-6 py-20">
      <div className="mx-auto max-w-4xl">
        <p className="mb-2 text-center text-xs uppercase tracking-widest text-primary">
          {t('section_label')}
        </p>
        <h2 className="mb-12 text-center text-2xl font-bold text-text-primary sm:text-3xl">
          {t('section_title')}
        </h2>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {FEATURES.map(({ icon, titleKey, descKey }) => (
            <div
              key={titleKey}
              className="rounded-xl border border-border bg-surface p-6 hover:border-primary/50 transition-colors"
            >
              <div className="mb-3 text-3xl">{icon}</div>
              <h3 className="mb-2 font-semibold text-text-primary">{t(titleKey)}</h3>
              <p className="text-sm text-text-muted">{t(descKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
