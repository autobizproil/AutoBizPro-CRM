// landing/app/page.tsx
import { redirect } from 'next/navigation'

export default function RootPage() {
  // default locale — keep in sync with i18n.ts
  redirect('/he/')
}
