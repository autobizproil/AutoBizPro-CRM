// landing/app/[locale]/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Heebo } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import '../globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const heebo = Heebo({ subsets: ['hebrew', 'latin'], variable: '--font-heebo', display: 'swap' })

export const metadata: Metadata = {
  title: 'AutoBizPro — CRM ואוטומציות לעסקים',
  description: 'נהל לקוחות, אוטומציות ומכירות ממקום אחד. CRM חכם לעסקים קטנים ובינוניים.',
}

export function generateStaticParams() {
  return [{ locale: 'he' }, { locale: 'en' }]
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
    <html lang={locale} dir={dir} className={`${inter.variable} ${heebo.variable}`}>
      <body className="font-sans antialiased">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
