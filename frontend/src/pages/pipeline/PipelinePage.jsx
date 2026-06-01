import { useState } from 'react'
import { usePipeline, useChangeStage } from '../../hooks/usePipeline'
import LeadPanel from '../leads/LeadPanel'
import { useAuth } from '../../context/AuthContext'

export default function PipelinePage() {
  const { data: stages = [], isLoading } = usePipeline()
  const changeStage = useChangeStage()
  const { can } = useAuth()
  const [panelId, setPanelId] = useState(null)
  const [dragging, setDragging]  = useState(false)

  const handleDragStart = (e, lead) => {
    e.dataTransfer.setData('leadId', lead.id)
    setDragging(true)
  }

  const handleDragEnd = () => setDragging(false)

  const handleDrop = (e, stageId) => {
    e.preventDefault()
    setDragging(false)
    const leadId = Number(e.dataTransfer.getData('leadId'))
    if (!leadId) return
    changeStage.mutate({ leadId, stageId })
  }

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

      <div className="flex gap-4 overflow-x-auto pb-4 items-start">
        {stages.map(stage => {
          const leads = stage.leads ?? []
          return (
            <div key={stage.id}
              className="flex-shrink-0 w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
              onDrop={e => handleDrop(e, stage.id)}
              onDragOver={e => e.preventDefault()}>

              {/* Column header */}
              <div className="px-3 py-2.5 rounded-t-xl flex items-center justify-between"
                style={{ backgroundColor: stage.color + '22', borderBottom: `3px solid ${stage.color}` }}>
                <span className="font-semibold text-sm" style={{ color: stage.color }}>{stage.name}</span>
                <span className="text-xs bg-white dark:bg-gray-800 rounded-full px-2 py-0.5 font-medium" style={{ color: stage.color }}>
                  {leads.length}
                </span>
              </div>

              {/* Cards */}
              <div className="p-2 space-y-2 min-h-32">
                {leads.length === 0 && (
                  <div className="text-center text-gray-300 dark:text-gray-600 text-xs py-6 select-none">גרור לכאן</div>
                )}
                {leads.map(lead => (
                  <div key={lead.id}
                    draggable
                    onDragStart={e => handleDragStart(e, lead)}
                    onDragEnd={handleDragEnd}
                    onClick={() => !dragging && setPanelId(lead.id)}
                    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 min-h-[64px] cursor-pointer hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 active:scale-[0.98] transition-all select-none group/card">

                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: stage.color }}>
                        {lead.name?.trim()
                          ? lead.name.trim()[0].toUpperCase()
                          : <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                        }
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate flex items-center gap-1">
                          {lead.name?.trim()
                            ? <span className="text-gray-900 dark:text-gray-100">{lead.name}</span>
                            : <span className="text-[#2398c2] dark:text-[#2398c2] font-medium">פתח רשומה →</span>
                          }
                        </div>
                        {lead.phone && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5" dir="ltr">{lead.phone}</div>}
                        {lead.source && <div className="text-xs text-gray-400 dark:text-gray-500">{lead.source}</div>}
                      </div>
                    </div>

                    {lead.assigned_user && (
                      <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-xs overflow-hidden flex-shrink-0">
                          {lead.assigned_user.name?.trim()
                            ? lead.assigned_user.name.trim()[0].toUpperCase()
                            : <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                          }
                        </div>
                        <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{lead.assigned_user.name}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {stages.length === 0 && (
          <div className="text-center text-gray-400 dark:text-gray-500 py-16 w-full">
            <div className="text-4xl mb-3">🔀</div>
            <div>אין שלבי פייפליין</div>
          </div>
        )}
      </div>

      {/* Lead detail panel */}
      {panelId && (
        <LeadPanel
          leadId={panelId}
          stages={stages}
          canEdit={can('leads', 'can_update')}
          onClose={() => setPanelId(null)}
        />
      )}
    </div>
  )
}
