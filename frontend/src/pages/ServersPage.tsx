import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Trash2, Pencil, Wifi, WifiOff, AlertCircle, HelpCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { getServers, createServer, updateServer, deleteServer, syncServer } from '../api/client'
import type { Server, ServerRequest } from '../types'
import ServerForm from '../components/servers/ServerForm'

const statusIcon: Record<string, React.ReactNode> = {
  online:  <Wifi size={14} className="text-green-400" />,
  offline: <WifiOff size={14} className="text-gray-500" />,
  error:   <AlertCircle size={14} className="text-red-400" />,
  unknown: <HelpCircle size={14} className="text-gray-500" />,
}
const statusBadge: Record<string, string> = {
  online:  'bg-green-900/50 text-green-400 border border-green-700',
  offline: 'bg-gray-700 text-gray-400 border border-gray-600',
  error:   'bg-red-900/50 text-red-400 border border-red-700',
  unknown: 'bg-gray-700 text-gray-400 border border-gray-600',
}

export default function ServersPage() {
  const qc = useQueryClient()
  const { data: servers = [] } = useQuery({ queryKey: ['servers'], queryFn: getServers })
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Server | null>(null)

  const createM = useMutation({ mutationFn: createServer, onSuccess: () => { qc.invalidateQueries({ queryKey: ['servers'] }); setModal(null) } })
  const updateM = useMutation({ mutationFn: ({ id, data }: { id: number; data: ServerRequest }) => updateServer(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['servers'] }); setModal(null) } })
  const deleteM = useMutation({ mutationFn: deleteServer, onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }) })
  const syncM   = useMutation({ mutationFn: syncServer,   onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }) })

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">
      <div className="flex items-center justify-between px-6 py-4 bg-gray-900 border-b border-gray-700">
        <div>
          <h1 className="text-base font-semibold text-white">Servers</h1>
          <p className="text-xs text-gray-400 mt-0.5">{servers.length} server{servers.length !== 1 ? 's' : ''} configured</p>
        </div>
        <button onClick={() => { setEditing(null); setModal('add') }}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
          <Plus size={14} /> Add Server
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <p className="text-lg font-medium text-gray-400 mb-2">No servers yet</p>
            <p className="text-sm">Click "Add Server" to connect your first server via SSH.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {servers.map(s => (
              <div key={s.id} className="bg-gray-800 border border-gray-700 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="mt-0.5">{statusIcon[s.status] ?? statusIcon.unknown}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-semibold text-white">{s.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge[s.status] ?? statusBadge.unknown}`}>
                          {s.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 mt-1 font-mono">
                        {s.username}@{s.host}:{s.port}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Last synced: {s.last_sync_at ? format(parseISO(s.last_sync_at), 'MMM d, h:mm a') : 'Never'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => syncM.mutate(s.id)}
                      disabled={syncM.isPending}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={12} className={syncM.isPending ? 'animate-spin' : ''} />
                      Sync
                    </button>
                    <button onClick={() => { setEditing(s); setModal('edit') }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => { if (confirm(`Delete ${s.name}?`)) deleteM.mutate(s.id) }}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-900/30 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h2 className="font-semibold text-white">{modal === 'add' ? 'Add Server' : 'Edit Server'}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="p-6">
              <ServerForm
                initial={editing ?? undefined}
                onSubmit={async data => {
                  if (modal === 'add') await createM.mutateAsync(data)
                  else if (editing) await updateM.mutateAsync({ id: editing.id, data })
                }}
                onCancel={() => setModal(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
