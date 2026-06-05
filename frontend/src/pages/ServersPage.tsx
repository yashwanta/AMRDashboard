import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Trash2, Pencil, Wifi, WifiOff, AlertCircle, HelpCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { getServers, createServer, updateServer, deleteServer, syncServer } from '../api/client'
import type { Server, ServerRequest } from '../types'
import ServerForm from '../components/servers/ServerForm'
import Header from '../components/layout/Header'

const statusIcon: Record<string, React.ReactNode> = {
  online:  <Wifi size={14} className="text-green-500" />,
  offline: <WifiOff size={14} className="text-gray-400" />,
  error:   <AlertCircle size={14} className="text-red-500" />,
  unknown: <HelpCircle size={14} className="text-gray-400" />,
}

export default function ServersPage() {
  const qc = useQueryClient()
  const { data: servers = [] } = useQuery({ queryKey: ['servers'], queryFn: getServers })

  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Server | null>(null)

  const createM = useMutation({
    mutationFn: createServer,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['servers'] }); setModal(null) },
  })

  const updateM = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ServerRequest }) => updateServer(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['servers'] }); setModal(null) },
  })

  const deleteM = useMutation({
    mutationFn: deleteServer,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }),
  })

  const syncM = useMutation({
    mutationFn: syncServer,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }),
  })

  const openAdd = () => { setEditing(null); setModal('add') }
  const openEdit = (s: Server) => { setEditing(s); setModal('edit') }

  return (
    <div className="flex flex-col h-full">
      <Header title="Servers" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm text-gray-500">{servers.length} server{servers.length !== 1 ? 's' : ''} configured</p>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Add Server
          </button>
        </div>

        <div className="grid gap-4">
          {servers.map(s => (
            <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
              <div className="flex items-center gap-2">
                {statusIcon[s.status]}
                <span className="text-xs text-gray-500 capitalize">{s.status}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800">{s.name}</span>
                </div>
                <div className="text-sm text-gray-500 mt-0.5">
                  {s.username}@{s.host}:{s.port}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Last sync: {s.last_sync_at ? format(parseISO(s.last_sync_at), 'MMM d, HH:mm') : 'Never'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => syncM.mutate(s.id)}
                  disabled={syncM.isPending}
                  title="Sync now"
                  className="p-2 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
                >
                  <RefreshCw size={16} className={syncM.isPending ? 'animate-spin' : ''} />
                </button>
                <button onClick={() => openEdit(s)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors">
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => { if (confirm(`Delete "${s.name}"?`)) deleteM.mutate(s.id) }}
                  className="p-2 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}

          {servers.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <p className="mb-3">No servers yet.</p>
              <button onClick={openAdd} className="btn-primary">Add your first server</button>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-5">
              {modal === 'add' ? 'Add Server' : `Edit: ${editing?.name}`}
            </h2>
            <ServerForm
              initial={editing ?? undefined}
              onSubmit={async data => {
                if (modal === 'edit' && editing) {
                  await updateM.mutateAsync({ id: editing.id, data })
                } else {
                  await createM.mutateAsync(data)
                }
              }}
              onCancel={() => setModal(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
