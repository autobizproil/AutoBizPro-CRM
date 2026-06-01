import { getTranslations } from 'next-intl/server'

export default async function Footer() {
  const t = await getTranslations('footer')

  return (
    <footer id="contact" className="border-t border-border bg-[#080810] px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <p className="text-base font-bold text-primary-soft">AutoBizPro</p>
            <p className="mt-1 text-xs text-text-muted">{t('tagline')}</p>
          </div>

          <nav className="flex gap-6 text-xs text-text-dim">
            <a href="#" className="hover:text-text-primary transition-colors">{t('privacy')}</a>
            <a href="#" className="hover:text-text-primary transition-colors">{t('terms')}</a>
            <a href="mailto:autobizpro.il@gmail.com" className="hover:text-text-primary transition-colors">{t('contact')}</a>
          </nav>
        </div>

        <div className="mt-6 border-t border-border pt-6 text-xs text-text-dim">
          {t('copyright')}
        </div>
      </div>
    </footer>
  )
}
