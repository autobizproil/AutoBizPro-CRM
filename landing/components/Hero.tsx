import { getTranslations } from 'next-intl/server'

export default async function Hero() {
  const t = await getTranslations('hero')

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-bg to-[#12122a] px-6 py-24 text-center">
      <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-10">
        <div className="h-72 w-[600px] rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl">
        <div className="mb-6 inline-flex items-center rounded-full border border-[#312e81] bg-[#1e1b4b] px-4 py-1.5 text-xs text-primary-soft">
          {t('badge')}
        </div>

        <h1 className="mb-4 text-4xl font-bold leading-tight tracking-tight text-text-primary sm:text-5xl">
          {t('headline')}
        </h1>

        <p className="mb-10 text-base text-text-muted sm:text-lg">
          {t('subtitle')}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <a
            href="#contact"
            className="rounded-lg bg-primary px-8 py-3 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            {t('cta_primary')}
          </a>
          <a
            href="#contact"
            className="rounded-lg border border-border px-8 py-3 text-sm text-text-muted hover:border-primary hover:text-text-primary transition-colors"
          >
            {t('cta_secondary')}
          </a>
        </div>
      </div>
    </section>
  )
}
