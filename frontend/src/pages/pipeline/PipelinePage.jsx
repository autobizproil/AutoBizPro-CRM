import { usePipeline } from '../../hooks/usePipeline'
import KanbanBoard from './KanbanBoard'

export default function PipelinePage() {
  const { data: stages = [], isLoading } = usePipeline()
  const total = stages.reduce((sum, s) => sum + (s.leads ?? []).length, 0)

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500">טוען פייפליין...</div>
  )

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">פייפליין</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{total} לידים פעילים — גרור בין עמודות לשינוי שלב · לחץ לפתיחת רשומה</p>
      </div>
      <KanbanBoard stages={stages} />
    </div>
  )
}
