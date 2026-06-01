import { getTranslations } from 'next-intl/server'

export default async function CtaSection() {
  const t = await getTranslations('cta')

  return (
    <section className="bg-gradient-to-br from-[#1e1b4b] to-bg px-6 py-24 text-center">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-3 text-3xl font-bold text-text-primary">{t('headline')}</h2>
        <p className="mb-8 text-text-muted">{t('subtitle')}</p>
        <a
          href="#contact"
          className="inline-block rounded-lg bg-primary px-10 py-4 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
        >
          {t('button')}
        </a>
      </div>
    </section>
  )
}
