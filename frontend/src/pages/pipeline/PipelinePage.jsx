import { usePipeline, useChangeStage } from '../../hooks/usePipeline'

export default function PipelinePage() {
  const { data: stages = [], isLoading } = usePipeline()
  const changeStage = useChangeStage()

  const handleDrop = (e, stageId) => {
    e.preventDefault()
    const leadId = Number(e.dataTransfer.getData('leadId'))
    if (!leadId) return
    changeStage.mutate({ leadId, stageId })
  }

  const total = stages.reduce((sum, s) => sum + (s.leads ?? []).length, 0)

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">טוען פייפליין...</div>
  )

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">פייפליין</h1>
        <p className="text-sm text-gray-500 mt-0.5">{total} לידים פעילים — גרור בין עמודות לשינוי שלב</p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 items-start">
        {stages.map(stage => {
          const leads = stage.leads ?? []
          return (
            <div key={stage.id}
              className="flex-shrink-0 w-64 rounded-xl border border-gray-200 bg-gray-50"
              onDrop={e => handleDrop(e, stage.id)}
              onDragOver={e => e.preventDefault()}>

              {/* Column header */}
              <div className="px-3 py-2.5 rounded-t-xl flex items-center justify-between"
                style={{ backgroundColor: stage.color + '22', borderBottom: `3px solid ${stage.color}` }}>
                <span className="font-semibold text-sm" style={{ color: stage.color }}>{stage.name}</span>
                <span className="text-xs bg-white rounded-full px-2 py-0.5 font-medium" style={{ color: stage.color }}>
                  {leads.length}
                </span>
              </div>

              {/* Cards */}
              <div className="p-2 space-y-2 min-h-32">
                {leads.length === 0 && (
                  <div className="text-center text-gray-300 text-xs py-6 select-none">גרור לכאן</div>
                )}
                {leads.map(lead => (
                  <div key={lead.id} draggable
                    onDragStart={e => e.dataTransfer.setData('leadId', lead.id)}
                    className="bg-white rounded-lg border border-gray-200 p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all hover:border-gray-300 select-none">

                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: stage.color }}>
                        {lead.name[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm text-gray-900 truncate">{lead.name}</div>
                        {lead.phone && (
                          <div className="text-xs text-gray-400 mt-0.5">{lead.phone}</div>
                        )}
                        {lead.source && (
                          <div className="text-xs text-gray-400">{lead.source}</div>
                        )}
                      </div>
                    </div>

                    {lead.assigned_user && (
                      <div className="mt-2 flex items-center gap-1">
                        <div className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs">
                          {lead.assigned_user.name[0]}
                        </div>
                        <span className="text-xs text-gray-400">{lead.assigned_user.name}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {stages.length === 0 && (
          <div className="text-center text-gray-400 py-16 w-full">
            <div className="text-4xl mb-3">🔀</div>
            <div>אין שלבי פייפליין</div>
          </div>
        )}
      </div>
    </div>
  )
}
