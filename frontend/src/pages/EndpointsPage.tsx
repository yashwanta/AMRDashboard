import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ServerCog, Pencil, Trash2, Wifi, WifiOff } from 'lucide-react'
import { createServer, deleteServer, getServers, updateServer } from '../api/client'
import type { Server, ServerRequest } from '../types'
import ServerForm from '../components/servers/ServerForm'

export default function EndpointsPage() {
  const qc = useQueryClient()
  const { data: servers = [] } = useQuery({ queryKey: ['servers'], queryFn: getServers })
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Server | null>(null)

  const createM = useMutation({ mutationFn: createServer, onSuccess: () => { qc.invalidateQueries({ queryKey: ['servers'] }); setModal(null) } })
  const updateM = useMutation({ mutationFn: ({ id, data }: { id: number; data: ServerRequest }) => updateServer(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['servers'] }); setModal(null) } })
  const deleteM = useMutation({ mutationFn: deleteServer, onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }) })

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">
      <div className="flex items-center justify-between px-6 py-4 bg-gray-900 border-b border-gray-700">
        <div>
          <h1 className="text-base font-semibold text-white">Endpoints</h1>
          <p className="text-xs text-gray-400 mt-0.5">SSH targets available to OpsForge actions and log collection</p>
        </div>
        <button onClick={() => { setEditing(null); setModal('add') }} className="btn-primary flex items-center gap-2">
          <Plus size={14} /> Add Endpoint
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {servers.map(server => (
            <div key={server.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <ServerCog size={18} className="text-blue-300 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-white truncate">{server.name}</h2>
                    <p className="text-xs text-gray-400 font-mono mt-1">{server.username}@{server.host}:{server.port}</p>
                    <div className="flex items-center gap-2 mt-3">
                      {server.status === 'online' ? <Wifi size={13} className="text-green-300" /> : <WifiOff size={13} className="text-gray-500" />}
                      <span className={server.status === 'online' ? 'text-xs text-green-300' : 'text-xs text-gray-400'}>{server.status}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="text-xs px-2 py-0.5 rounded-md border border-gray-700 bg-gray-900 text-gray-300">OpsForge target</span>
                      {server.proxmox_host && <span className="text-xs px-2 py-0.5 rounded-md border border-purple-800 bg-purple-950/40 text-purple-200">PVE mapped</span>}
                      {server.app_log_paths && <span className="text-xs px-2 py-0.5 rounded-md border border-blue-800 bg-blue-950/40 text-blue-200">App logs</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700" onClick={() => { setEditing(server); setModal('edit') }}>
                    <Pencil size={14} />
                  </button>
                  <button className="p-1.5 rounded-md text-gray-500 hover:text-red-300 hover:bg-red-950/40" onClick={() => { if (confirm(`Delete endpoint ${server.name}?`)) deleteM.mutate(server.id) }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {servers.length === 0 && (
          <div className="text-center text-gray-500 py-16">
            <p className="text-lg text-gray-400 font-medium">No endpoints yet</p>
            <p className="text-sm mt-1">Add an endpoint to use it as an OpsForge target.</p>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h2 className="font-semibold text-white">{modal === 'add' ? 'Add Endpoint' : 'Edit Endpoint'}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="p-6">
              <ServerForm
                initial={editing ?? undefined}
                submitLabel={modal === 'add' ? 'Add Endpoint' : 'Update Endpoint'}
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
