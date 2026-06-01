'use client'

import { useTranslations, useLocale } from 'next-intl'
import { useRouter, usePathname } from 'next/navigation'

export default function Navbar() {
  const t = useTranslations('nav')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  function toggleLocale() {
    const next = locale === 'he' ? 'en' : 'he'
    const newPath = pathname.replace(`/${locale}`, `/${next}`)
    router.push(newPath)
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <span className="text-lg font-bold text-primary-soft">AutoBizPro</span>

        <div className="flex items-center gap-4 sm:gap-6">
          <a href="#features" className="hidden text-sm text-text-muted hover:text-text-primary transition-colors sm:block">
            {t('features')}
          </a>
          <a href="#pricing" className="hidden text-sm text-text-muted hover:text-text-primary transition-colors sm:block">
            {t('pricing')}
          </a>
          <a href="#contact" className="hidden text-sm text-text-muted hover:text-text-primary transition-colors sm:block">
            {t('contact')}
          </a>
          <button
            onClick={toggleLocale}
            className="rounded border border-primary px-3 py-1 text-xs text-primary hover:bg-primary/10 transition-colors"
          >
            {locale === 'he' ? 'EN' : 'עב'}
          </button>
          <a
            href="#contact"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            {t('cta')}
          </a>
        </div>
      </div>
    </nav>
  )
}
