import { getTranslations } from 'next-intl/server'

export default async function Pricing() {
  const t = await getTranslations('pricing')

  return (
    <section id="pricing" className="bg-[#080810] px-6 py-20">
      <div className="mx-auto max-w-4xl">
        <p className="mb-2 text-center text-xs uppercase tracking-widest text-primary">
          {t('section_label')}
        </p>
        <h2 className="mb-12 text-center text-2xl font-bold text-text-primary sm:text-3xl">
          {t('section_title')}
        </h2>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* CRM — highlighted */}
          <div className="rounded-xl border border-primary bg-surface p-8">
            <p className="mb-4 text-xs uppercase tracking-widest text-primary">{t('crm_name')}</p>
            <div className="mb-2 flex items-end gap-1">
              <span className="text-4xl font-bold text-text-primary">{t('crm_price')}</span>
              <span className="mb-1 text-sm text-text-muted">{t('crm_period')}</span>
            </div>
            <p className="mb-6 text-sm text-text-muted">{t('crm_desc')}</p>
            <a
              href="#contact"
              className="block w-full rounded-lg bg-primary py-3 text-center text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
            >
              {t('crm_cta')}
            </a>
          </div>

          {/* Automations — contact */}
          <div className="rounded-xl border border-border bg-surface p-8">
            <p className="mb-4 text-xs uppercase tracking-widest text-primary">{t('auto_name')}</p>
            <div className="mb-2 flex items-end gap-1">
              <span className="text-4xl font-bold text-text-primary">{t('auto_price')}</span>
            </div>
            <p className="mb-6 text-sm text-text-muted">{t('auto_desc')}</p>
            <a
              href="#contact"
              className="block w-full rounded-lg border border-border py-3 text-center text-sm text-text-muted hover:border-primary hover:text-text-primary transition-colors"
            >
              {t('auto_cta')}
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
