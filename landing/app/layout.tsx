// landing/app/layout.tsx
// Minimal root layout required by Next.js App Router.
// The actual locale-specific layout lives in app/[locale]/layout.tsx.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
