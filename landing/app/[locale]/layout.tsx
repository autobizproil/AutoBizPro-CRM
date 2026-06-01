// landing/app/[locale]/layout.tsx
import type { Metadata } from 'next'
import { Inter, Heebo } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import '../globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const heebo = Heebo({ subsets: ['hebrew', 'latin'], variable: '--font-heebo', display: 'swap' })

const META: Record<string, { title: string; description: string }> = {
  he: {
    title: 'AutoBizPro — CRM ואוטומציות לעסקים',
    description: 'נהל לקוחות, אוטומציות ומכירות ממקום אחד. CRM חכם לעסקים קטנים ובינוניים.',
  },
  en: {
    title: 'AutoBizPro — CRM & Automations for Business',
    description: 'Manage clients, automations & sales in one place. Smart CRM for small and medium businesses.',
  },
}

export function generateStaticParams() {
  return [{ locale: 'he' }, { locale: 'en' }]
}

export function generateMetadata({ params: { locale } }: { params: { locale: string } }): Metadata {
  return META[locale] ?? META.he
}

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  const messages = await getMessages()
  const dir = locale === 'he' ? 'rtl' : 'ltr'

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning className={`${inter.variable} ${heebo.variable}`}>
      <body className="font-sans antialiased">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
