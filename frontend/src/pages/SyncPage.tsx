import { useQuery } from '@tanstack/react-query'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { getSyncHistory } from '../api/client'
import Header from '../components/layout/Header'
import { clsx } from 'clsx'

const statusColor: Record<string, string> = {
  running: 'bg-blue-100 text-blue-700',
  success: 'bg-green-100 text-green-700',
  failed:  'bg-red-100 text-red-700',
}

export default function SyncPage() {
  const { data: jobs = [] } = useQuery({
    queryKey: ['sync-history'],
    queryFn: getSyncHistory,
    refetchInterval: 10_000,
  })

  return (
    <div className="flex flex-col h-full">
      <Header title="Sync Jobs" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 font-medium">Server</th>
                <th className="px-5 py-3 font-medium">Started</th>
                <th className="px-5 py-3 font-medium">Duration</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Events Found</th>
                <th className="px-5 py-3 font-medium">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {jobs.map(j => (
                <tr key={j.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{j.server_name}</td>
                  <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                    {format(parseISO(j.started_at), 'MM/dd HH:mm:ss')}
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {j.finished_at
                      ? formatDistanceToNow(parseISO(j.started_at), { addSuffix: false }) + ' ago'
                      : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', statusColor[j.status])}>
                      {j.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-700 font-mono">{j.event_count}</td>
                  <td className="px-5 py-3 text-red-500 text-xs max-w-xs truncate">{j.error || '—'}</td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-gray-400">
                    No sync jobs yet. Add a server and trigger a sync.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
