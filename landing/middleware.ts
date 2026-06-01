// landing/middleware.ts
import createMiddleware from 'next-intl/middleware'

export default createMiddleware({
  locales: ['he', 'en'],
  defaultLocale: 'he',
})

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
