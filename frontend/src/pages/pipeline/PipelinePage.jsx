import { usePipeline, useChangeStage } from '../../hooks/usePipeline'

export default function PipelinePage() {
  const { data: stages = [], isLoading } = usePipeline()
  const changeStage                      = useChangeStage()

  const handleDrop = (e, stageId) => {
    e.preventDefault()
    const leadId = Number(e.dataTransfer.getData('leadId'))
    if (!leadId) return
    changeStage.mutate({ leadId, stageId })
  }

  const handleDragOver = (e) => e.preventDefault()

  if (isLoading) return <div className="text-gray-500">טוען...</div>

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-6">פייפליין</h2>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map(stage => (
          <div
            key={stage.id}
            className="flex-shrink-0 w-64 bg-gray-50 rounded-xl border border-gray-200"
            onDrop={e => handleDrop(e, stage.id)}
            onDragOver={handleDragOver}
            data-testid={`stage-${stage.id}`}
          >
            <div
              className="p-3 rounded-t-xl text-white text-sm font-semibold"
              style={{ backgroundColor: stage.color }}
            >
              {stage.name}
              <span className="mr-2 opacity-80 text-xs">({(stage.leads ?? []).length})</span>
            </div>

            <div className="p-2 space-y-2 min-h-24">
              {(stage.leads ?? []).map(lead => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={e => e.dataTransfer.setData('leadId', lead.id)}
                  className="bg-white rounded-lg border border-gray-200 p-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow"
                  data-testid={`lead-card-${lead.id}`}
                >
                  <div className="font-medium text-sm text-gray-900">{lead.name}</div>
                  {lead.phone && <div className="text-xs text-gray-500 mt-0.5">{lead.phone}</div>}
                  {lead.assigned_user && (
                    <div className="text-xs text-indigo-600 mt-1">{lead.assigned_user.name}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
