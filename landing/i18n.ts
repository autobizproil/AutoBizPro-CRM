import { notFound } from 'next/navigation'
import { getRequestConfig } from 'next-intl/server'

const LOCALES = ['he', 'en'] as const

export default getRequestConfig(async ({ locale }) => {
  if (!LOCALES.includes(locale as (typeof LOCALES)[number])) notFound()
  return {
    messages: (await import(`./messages/${locale}.json`)).default,
  }
})
