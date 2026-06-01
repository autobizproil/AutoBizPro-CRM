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
