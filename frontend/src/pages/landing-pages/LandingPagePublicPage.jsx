import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import axios from 'axios'
import LandingPagePreview from './LandingPagePreview'

/* Public axios instance — no auth headers, no credentials */
const publicClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})

export default function LandingPagePublicPage() {
  const { tenant, slug } = useParams()
  const [submitted, setSubmitted] = useState(false)

  /* ── Fetch page data ─────────────────────────────── */
  const { data: page, isLoading, isError } = useQuery({
    queryKey: ['lp-public', tenant, slug],
    queryFn: () =>
      publicClient
        .get(`/lp/${tenant}/${slug}`, { headers: { 'X-Tenant': tenant } })
        .then((r) => r.data.data ?? r.data),
    retry: false,
  })

  /* ── Form submission ─────────────────────────────── */
  const submitMutation = useMutation({
    mutationFn: (formData) =>
      publicClient.post(
        `/lp/${tenant}/${slug}/submit`,
        formData,
        { headers: { 'X-Tenant': tenant } }
      ),
    onSuccess: () => setSubmitted(true),
  })

  const handleFormSubmit = (formData) => {
    submitMutation.mutate(formData)
  }

  /* ── States ──────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-3 animate-pulse">🌐</div>
          <p className="text-sm">טוען דף...</p>
        </div>
      </div>
    )
  }

  if (isError || !page) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
        <div className="text-center text-gray-500">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">דף לא נמצא</h1>
          <p className="text-sm text-gray-500">הדף שחיפשת אינו קיים או שאינו זמין.</p>
        </div>
      </div>
    )
  }

  if (page.status && page.status !== 'published') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
        <div className="text-center text-gray-500">
          <div className="text-5xl mb-4">🚧</div>
          <h1 className="text-xl font-bold text-gray-700 mb-2">הדף בבנייה</h1>
          <p className="text-sm text-gray-500">הדף עדיין לא פורסם.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white" dir="rtl">
      <LandingPagePreview
        blocks={page.blocks ?? []}
        onSubmit={handleFormSubmit}
        submitting={submitMutation.isPending}
        submitted={submitted}
      />
    </div>
  )
}
