# AutoBizPro Landing Page — Design Spec
Date: 2026-06-01

## Overview

Standalone marketing landing page for AutoBizPro — a CRM + Automations SaaS for Israeli small/medium businesses. Separate Next.js project, no shared code with the existing CRM app.

## Product Context

- **Product**: CRM + Automations SaaS
- **Target audience**: Small businesses (1–10) and medium businesses (10–100)
- **Languages**: Hebrew (primary, RTL) + English (LTR), toggleable
- **Primary CTAs**: Free trial + Contact

## Stack

- **Framework**: Next.js 14 (App Router, static export)
- **Styling**: Tailwind CSS v3
- **i18n**: next-intl (routing: `/he/`, `/en/`)
- **Fonts**: Inter (Latin) + Heebo (Hebrew, RTL)
- **Deploy target**: Static export → any CDN (Vercel recommended)
- **Location**: `D:/פרוייקט חדש/landing/` (separate folder, separate repo-worthy)

## Design Language

- **Style**: Dark Pro — dark background, indigo accent (inspired by Linear/Vercel)
- **Colors**:
  - Background: `#0d0d14`
  - Surface: `#111827`
  - Border: `#1f2937`
  - Primary: `#6366f1` (indigo)
  - Primary soft: `#818cf8`
  - Text primary: `#f1f5f9`
  - Text muted: `#64748b`
- **Typography**:
  - Headlines: bold, tight letter-spacing
  - Body: 14–16px, relaxed
  - RTL: direction flips on `<html dir="rtl">`

## Page Sections (top to bottom)

### 1. Navbar
- Logo (AutoBizPro, indigo)
- Nav links: Features · Pricing · Contact
- Language toggle button (HE/EN)
- CTA button: "התחל ניסיון" / "Start Free Trial" (indigo fill)
- Sticky, blur-backdrop on scroll

### 2. Hero
- Eyebrow badge: "CRM + Automations for Business"
- Headline (HE): "נהל לקוחות, אוטומציות ומכירות — ממקום אחד"
- Headline (EN): "Manage clients, automations & sales — all in one place"
- Subtitle: short value proposition
- Dual CTA: primary "התחל ניסיון חינמי" + secondary "צור קשר"
- Background: subtle radial gradient (#0d0d14 → #12122a)

### 3. Social Proof Bar
- "500+ עסקים סומכים עלינו · ★★★★★ 4.9"
- Dark strip, muted text

### 4. Features (4 cards, 2×2 grid)
| Icon | Title | Description |
|------|-------|-------------|
| 🎯 | ניהול לידים | פייפליין מכירות חכם, מעקב אוטומטי |
| ⚡ | אוטומציות | Workflow אוטומטי, הודעות, משימות |
| 👥 | ניהול לקוחות | היסטוריה מלאה, תיוגים, סגמנטציה |
| 🔗 | אינטגרציות | WhatsApp, Gmail, Zapier ועוד |

### 5. Pricing (2 cards)
| Plan | Price | CTA |
|------|-------|-----|
| CRM | ₪80/משתמש/חודש | Start Trial (indigo) |
| Automations | Custom — Contact | צור קשר (outline) |

### 6. Bottom CTA Section
- Headline: "מוכן להתחיל?" / "Ready to grow your business?"
- Single primary button: "התחל ניסיון חינמי — ללא כרטיס אשראי"
- Background: gradient (#1e1b4b → #0d0d14)

### 7. Footer
- Logo + tagline
- Links: Privacy · Terms · Contact
- Copyright: © 2026 AutoBizPro
- Social icons (optional)

## i18n Architecture

- Default locale: `he` (RTL)
- Secondary locale: `en` (LTR)
- All strings in `/messages/he.json` and `/messages/en.json`
- `<html lang dir>` set per locale
- Language toggle: client-side, persists to localStorage

## File Structure

```
landing/
├── app/
│   └── [locale]/
│       ├── layout.tsx       # sets lang + dir
│       └── page.tsx         # all sections
├── components/
│   ├── Navbar.tsx
│   ├── Hero.tsx
│   ├── SocialProof.tsx
│   ├── Features.tsx
│   ├── Pricing.tsx
│   ├── CtaSection.tsx
│   └── Footer.tsx
├── messages/
│   ├── he.json
│   └── en.json
├── public/
├── tailwind.config.ts
├── next.config.ts
└── package.json
```

## Out of Scope

- Backend / form submission (contact form posts to existing CRM API or mailto)
- Blog / docs pages
- Authentication
- Analytics (placeholder only)
