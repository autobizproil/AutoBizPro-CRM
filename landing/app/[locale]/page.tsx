import { setRequestLocale } from 'next-intl/server'
import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import SocialProof from '@/components/SocialProof'
import Features from '@/components/Features'
import Pricing from '@/components/Pricing'
import CtaSection from '@/components/CtaSection'
import Footer from '@/components/Footer'

export default function Page({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale)

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
