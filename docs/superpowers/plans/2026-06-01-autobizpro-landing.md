# AutoBizPro Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Next.js 14 static landing page for AutoBizPro CRM+Automations SaaS, bilingual Hebrew (RTL) / English (LTR), Dark Pro design.

**Architecture:** Next.js 14 App Router with `app/[locale]/` dynamic segment handled by next-intl v3. All sections are React Server Components using `getTranslations`. Only Navbar is a Client Component (needs language toggle interactivity). Output: `next export` static files deployable to any CDN.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS v3, next-intl v3, Google Fonts (Inter + Heebo)

---

## File Map

| File | Purpose |
|------|---------|
| `landing/package.json` | Dependencies |
| `landing/next.config.ts` | Static export + next-intl plugin |
| `landing/tailwind.config.ts` | Brand color tokens |
| `landing/middleware.ts` | Locale detection + redirect (dev only) |
| `landing/i18n.ts` | next-intl request config |
| `landing/messages/he.json` | All Hebrew strings |
| `landing/messages/en.json` | All English strings |
| `landing/app/globals.css` | Tailwind directives + base styles |
| `landing/app/[locale]/layout.tsx` | Sets `lang` + `dir` per locale, loads fonts, wraps NextIntlClientProvider |
| `landing/app/[locale]/page.tsx` | Composes all section components |
| `landing/components/Navbar.tsx` | Sticky nav, language toggle (Client Component) |
| `landing/components/Hero.tsx` | Hero section (Server Component) |
| `landing/components/SocialProof.tsx` | Trust bar (Server Component) |
| `landing/components/Features.tsx` | 2×2 feature cards (Server Component) |
| `landing/components/Pricing.tsx` | 2 pricing cards (Server Component) |
| `landing/components/CtaSection.tsx` | Bottom CTA (Server Component) |
| `landing/components/Footer.tsx` | Footer with contact link (Server Component) |

---

### Task 1: Scaffold Next.js project

**Files:**
- Create: `landing/` (entire scaffold)
- Modify: `landing/next.config.ts`
- Modify: `landing/tailwind.config.ts`

- [ ] **Step 1: Create Next.js app**

Run from `D:/פרוייקט חדש/`:
```bash
npx create-next-app@14 landing --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
```
Expected: `landing/` directory created. Answer prompts: TypeScript=Yes, ESLint=Yes, Tailwind=Yes, App Router=Yes.

- [ ] **Step 2: Install next-intl**

```bash
cd landing && npm install next-intl@3
```

- [ ] **Step 3: Replace `next.config.ts`**

```typescript
// landing/next.config.ts
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n.ts')

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
}

export default withNextIntl(nextConfig)
```

- [ ] **Step 4: Replace `tailwind.config.ts`**

```typescript
// landing/tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0d0d14',
        surface: '#111827',
        border: '#1f2937',
        primary: '#6366f1',
        'primary-soft': '#818cf8',
        'text-primary': '#f1f5f9',
        'text-muted': '#64748b',
        'text-dim': '#4b5563',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        hebrew: ['var(--font-heebo)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 5: Delete default boilerplate**

```bash
rm app/page.tsx app/layout.tsx app/globals.css 2>/dev/null; true
```

- [ ] **Step 6: Commit**

```bash
cd .. && git add landing/ && git commit -m "feat(landing): scaffold Next.js 14 + Tailwind + next-intl"
```

---

### Task 2: i18n configuration

**Files:**
- Create: `landing/i18n.ts`
- Create: `landing/middleware.ts`
- Create: `landing/messages/he.json`
- Create: `landing/messages/en.json`

- [ ] **Step 1: Create `landing/i18n.ts`**

```typescript
// landing/i18n.ts
import { getRequestConfig } from 'next-intl/server'

export default getRequestConfig(async ({ locale }) => ({
  messages: (await import(`./messages/${locale}.json`)).default,
}))
```

- [ ] **Step 2: Create `landing/middleware.ts`**

```typescript
// landing/middleware.ts
import createMiddleware from 'next-intl/middleware'

export default createMiddleware({
  locales: ['he', 'en'],
  defaultLocale: 'he',
})

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
```

- [ ] **Step 3: Create `landing/messages/he.json`**

```json
{
  "nav": {
    "features": "יתרונות",
    "pricing": "מחירים",
    "contact": "צור קשר",
    "cta": "התחל ניסיון"
  },
  "hero": {
    "badge": "CRM + אוטומציות לעסקים",
    "headline": "נהל לקוחות, אוטומציות ומכירות — ממקום אחד",
    "subtitle": "פלטפורמה חכמה שחוסכת זמן, מגדילה מכירות ומייעלת את העסק שלך",
    "cta_primary": "התחל ניסיון חינמי",
    "cta_secondary": "צור קשר"
  },
  "social": {
    "text": "500+ עסקים סומכים עלינו",
    "rating": "דירוג 4.9 ★★★★★"
  },
  "features": {
    "section_label": "יתרונות",
    "section_title": "כל מה שצריך לנהל עסק",
    "leads_title": "ניהול לידים",
    "leads_desc": "פייפליין מכירות חכם עם מעקב אוטומטי",
    "automations_title": "אוטומציות",
    "automations_desc": "Workflow אוטומטי, הודעות ומשימות",
    "customers_title": "ניהול לקוחות",
    "customers_desc": "היסטוריה מלאה, תיוגים וסגמנטציה",
    "integrations_title": "אינטגרציות",
    "integrations_desc": "WhatsApp, Gmail, Zapier ועוד"
  },
  "pricing": {
    "section_label": "מחירים",
    "section_title": "תמחור פשוט וברור",
    "crm_name": "CRM",
    "crm_price": "₪80",
    "crm_period": "למשתמש / חודש",
    "crm_desc": "ניהול לידים, לקוחות ודוחות",
    "crm_cta": "התחל ניסיון",
    "auto_name": "אוטומציות",
    "auto_price": "Custom",
    "auto_desc": "Workflow מותאם לעסק שלך",
    "auto_cta": "צור קשר"
  },
  "cta": {
    "headline": "מוכן להתחיל?",
    "subtitle": "הצטרף ל-500+ עסקים שכבר צומחים עם AutoBizPro",
    "button": "התחל ניסיון חינמי — ללא כרטיס אשראי"
  },
  "footer": {
    "tagline": "CRM ואוטומציות לעסקים חכמים",
    "privacy": "פרטיות",
    "terms": "תנאי שימוש",
    "contact": "צור קשר",
    "copyright": "© 2026 AutoBizPro. כל הזכויות שמורות."
  }
}
```

- [ ] **Step 4: Create `landing/messages/en.json`**

```json
{
  "nav": {
    "features": "Features",
    "pricing": "Pricing",
    "contact": "Contact",
    "cta": "Start Free Trial"
  },
  "hero": {
    "badge": "CRM + Automations for Business",
    "headline": "Manage clients, automations & sales — all in one place",
    "subtitle": "A smart platform that saves time, grows sales, and streamlines your business",
    "cta_primary": "Start Free Trial",
    "cta_secondary": "Contact Us"
  },
  "social": {
    "text": "Trusted by 500+ businesses",
    "rating": "Rated 4.9 ★★★★★"
  },
  "features": {
    "section_label": "Features",
    "section_title": "Everything you need to run your business",
    "leads_title": "Lead Management",
    "leads_desc": "Smart sales pipeline with automatic tracking",
    "automations_title": "Automations",
    "automations_desc": "Automated workflows, messages & tasks",
    "customers_title": "Customer Management",
    "customers_desc": "Full history, tags & segmentation",
    "integrations_title": "Integrations",
    "integrations_desc": "WhatsApp, Gmail, Zapier and more"
  },
  "pricing": {
    "section_label": "Pricing",
    "section_title": "Simple, transparent pricing",
    "crm_name": "CRM",
    "crm_price": "₪80",
    "crm_period": "per user / month",
    "crm_desc": "Lead management, customers & reports",
    "crm_cta": "Start Trial",
    "auto_name": "Automations",
    "auto_price": "Custom",
    "auto_desc": "Workflows tailored to your business",
    "auto_cta": "Contact Us"
  },
  "cta": {
    "headline": "Ready to start?",
    "subtitle": "Join 500+ businesses already growing with AutoBizPro",
    "button": "Start Free Trial — No Credit Card Required"
  },
  "footer": {
    "tagline": "CRM & Automations for smart businesses",
    "privacy": "Privacy",
    "terms": "Terms",
    "contact": "Contact",
    "copyright": "© 2026 AutoBizPro. All rights reserved."
  }
}
```

- [ ] **Step 5: Commit**

```bash
cd .. && git add landing/ && git commit -m "feat(landing): add i18n config and HE/EN message files"
```

---

### Task 3: Root layout + global styles

**Files:**
- Create: `landing/app/globals.css`
- Create: `landing/app/[locale]/layout.tsx`

- [ ] **Step 1: Create `landing/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html {
  background-color: #0d0d14;
  scroll-behavior: smooth;
}

body {
  background-color: #0d0d14;
  color: #f1f5f9;
}
```

- [ ] **Step 2: Create `landing/app/[locale]/layout.tsx`**

```typescript
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
```

- [ ] **Step 3: Add temp placeholder page to verify build**

```typescript
// landing/app/[locale]/page.tsx
export default function Page() {
  return <main className="bg-bg min-h-screen" />
}
```

- [ ] **Step 4: Verify dev server starts**

```bash
cd landing && npm run dev
```
Open http://localhost:3000 — expect redirect to http://localhost:3000/he, blank dark page. No console errors.

- [ ] **Step 5: Commit**

```bash
cd .. && git add landing/ && git commit -m "feat(landing): add root layout with i18n, fonts, RTL/LTR"
```

---

### Task 4: Navbar component

**Files:**
- Create: `landing/components/Navbar.tsx`

- [ ] **Step 1: Create `landing/components/Navbar.tsx`**

```typescript
// landing/components/Navbar.tsx
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
```

- [ ] **Step 2: Add Navbar to page.tsx**

```typescript
// landing/app/[locale]/page.tsx
import Navbar from '@/components/Navbar'

export default function Page() {
  return (
    <main className="bg-bg min-h-screen">
      <Navbar />
    </main>
  )
}
```

- [ ] **Step 3: Verify in browser**

Run `npm run dev`, open http://localhost:3000/he.
Expected: dark sticky navbar, "AutoBizPro" in indigo, "התחל ניסיון" button, "EN" toggle. Clicking EN navigates to /en and navbar shows "עב".

- [ ] **Step 4: Commit**

```bash
cd .. && git add landing/ && git commit -m "feat(landing): add Navbar with language toggle"
```

---

### Task 5: Hero section

**Files:**
- Create: `landing/components/Hero.tsx`

- [ ] **Step 1: Create `landing/components/Hero.tsx`**

```typescript
// landing/components/Hero.tsx
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
```

- [ ] **Step 2: Add Hero to page.tsx**

```typescript
import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'

export default function Page() {
  return (
    <main className="bg-bg min-h-screen">
      <Navbar />
      <Hero />
    </main>
  )
}
```

- [ ] **Step 3: Verify**

Open http://localhost:3000/he — hero shows Hebrew headline, indigo glow effect, two CTA buttons.

- [ ] **Step 4: Commit**

```bash
cd .. && git add landing/ && git commit -m "feat(landing): add Hero section"
```

---

### Task 6: SocialProof component

**Files:**
- Create: `landing/components/SocialProof.tsx`

- [ ] **Step 1: Create `landing/components/SocialProof.tsx`**

```typescript
// landing/components/SocialProof.tsx
import { getTranslations } from 'next-intl/server'

export default async function SocialProof() {
  const t = await getTranslations('social')

  return (
    <div className="border-y border-border bg-surface py-3 text-center">
      <p className="text-xs text-text-dim">
        {t('text')}&nbsp;&nbsp;·&nbsp;&nbsp;{t('rating')}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Add to page.tsx**

```typescript
import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import SocialProof from '@/components/SocialProof'

export default function Page() {
  return (
    <main className="bg-bg min-h-screen">
      <Navbar />
      <Hero />
      <SocialProof />
    </main>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd .. && git add landing/ && git commit -m "feat(landing): add SocialProof bar"
```

---

### Task 7: Features section

**Files:**
- Create: `landing/components/Features.tsx`

- [ ] **Step 1: Create `landing/components/Features.tsx`**

```typescript
// landing/components/Features.tsx
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
```

- [ ] **Step 2: Add to page.tsx**

```typescript
import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import SocialProof from '@/components/SocialProof'
import Features from '@/components/Features'

export default function Page() {
  return (
    <main className="bg-bg min-h-screen">
      <Navbar />
      <Hero />
      <SocialProof />
      <Features />
    </main>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd .. && git add landing/ && git commit -m "feat(landing): add Features section"
```

---

### Task 8: Pricing section

**Files:**
- Create: `landing/components/Pricing.tsx`

- [ ] **Step 1: Create `landing/components/Pricing.tsx`**

```typescript
// landing/components/Pricing.tsx
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
```

- [ ] **Step 2: Add to page.tsx**

```typescript
import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import SocialProof from '@/components/SocialProof'
import Features from '@/components/Features'
import Pricing from '@/components/Pricing'

export default function Page() {
  return (
    <main className="bg-bg min-h-screen">
      <Navbar />
      <Hero />
      <SocialProof />
      <Features />
      <Pricing />
    </main>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd .. && git add landing/ && git commit -m "feat(landing): add Pricing section"
```

---

### Task 9: CtaSection component

**Files:**
- Create: `landing/components/CtaSection.tsx`

- [ ] **Step 1: Create `landing/components/CtaSection.tsx`**

```typescript
// landing/components/CtaSection.tsx
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
```

- [ ] **Step 2: Add to page.tsx**

```typescript
import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import SocialProof from '@/components/SocialProof'
import Features from '@/components/Features'
import Pricing from '@/components/Pricing'
import CtaSection from '@/components/CtaSection'

export default function Page() {
  return (
    <main className="bg-bg min-h-screen">
      <Navbar />
      <Hero />
      <SocialProof />
      <Features />
      <Pricing />
      <CtaSection />
    </main>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd .. && git add landing/ && git commit -m "feat(landing): add CtaSection"
```

---

### Task 10: Footer component

**Files:**
- Create: `landing/components/Footer.tsx`

- [ ] **Step 1: Create `landing/components/Footer.tsx`**

```typescript
// landing/components/Footer.tsx
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
```

- [ ] **Step 2: Final `landing/app/[locale]/page.tsx`**

```typescript
// landing/app/[locale]/page.tsx
import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import SocialProof from '@/components/SocialProof'
import Features from '@/components/Features'
import Pricing from '@/components/Pricing'
import CtaSection from '@/components/CtaSection'
import Footer from '@/components/Footer'

export default function Page() {
  return (
    <main className="bg-bg">
      <Navbar />
      <Hero />
      <SocialProof />
      <Features />
      <Pricing />
      <CtaSection />
      <Footer />
    </main>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd .. && git add landing/ && git commit -m "feat(landing): add Footer, finalize page composition"
```

---

### Task 11: Final verification + static build

**Files:**
- Modify: `landing/.gitignore`

- [ ] **Step 1: Full visual check on /he**

```bash
cd landing && npm run dev
```
Open http://localhost:3000/he. Verify:
- RTL layout (text right-to-left, flex row direction reversed)
- All 7 sections render: Navbar, Hero, SocialProof, Features (4 cards), Pricing (2 cards), CtaSection, Footer
- Navbar sticky + blur on scroll
- Language toggle button shows "EN"

- [ ] **Step 2: Full visual check on /en**

Open http://localhost:3000/en. Verify:
- LTR layout
- All strings in English
- Language toggle shows "עב"

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Production build**

```bash
npm run build
```
Expected: Build completes with no errors. `out/` directory created with static HTML for `/he/` and `/en/`.

- [ ] **Step 5: Update `.gitignore`**

Add to `landing/.gitignore`:
```
out/
```
(`.next/` is already there from create-next-app)

- [ ] **Step 6: Final commit**

```bash
cd .. && git add landing/ && git commit -m "feat(landing): complete AutoBizPro landing page — static export verified"
```
