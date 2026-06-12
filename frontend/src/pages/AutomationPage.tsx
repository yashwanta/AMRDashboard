import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Play, Terminal, Wrench, KeyRound, ShieldCheck, X } from 'lucide-react'
import { getActionHistory, getServers, runAction } from '../api/client'
import type { ActionRunRequest, AutomationAction } from '../types'

const actionLabels: Record<AutomationAction, string> = {
  service_status: 'Check service status',
  service_restart: 'Restart service',
  service_start: 'Start service',
  service_stop: 'Stop service',
  service_enable: 'Enable service',
  service_disable: 'Disable service',
  package_update_cache: 'sudo apt/dnf update',
  package_list_upgrades: 'List available upgrades',
  package_upgrade_dry_run: 'Preview upgrade',
  package_upgrade: 'sudo apt/dnf upgrade',
  package_install: 'sudo apt/dnf install package',
  change_password: 'Change user password',
  custom_command: 'Custom command',
}

const serviceActions: AutomationAction[] = [
  'service_status',
  'service_restart',
  'service_start',
  'service_stop',
  'service_enable',
  'service_disable',
]

const sudoActions: AutomationAction[] = [
  'service_restart',
  'service_start',
  'service_stop',
  'service_enable',
  'service_disable',
  'package_update_cache',
  'package_upgrade',
  'package_install',
  'change_password',
]

export default function AutomationPage() {
  const qc = useQueryClient()
  const { data: servers = [] } = useQuery({ queryKey: ['servers'], queryFn: getServers })
  const { data: history = [] } = useQuery({ queryKey: ['action-history'], queryFn: getActionHistory, refetchInterval: 10_000 })
  const [serverId, setServerId] = useState<number>(0)
  const [action, setAction] = useState<AutomationAction>('service_status')
  const [serviceName, setServiceName] = useState('ssh')
  const [username, setUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [packageName, setPackageName] = useState('')
  const [sudoPassword, setSudoPassword] = useState('')
  const [sudoOpen, setSudoOpen] = useState(false)
  const [command, setCommand] = useState('')
  const [lastOutput, setLastOutput] = useState('')

  const selectedServer = useMemo(
    () => servers.find(s => s.id === serverId),
    [servers, serverId]
  )

  const mutation = useMutation({
    mutationFn: (payload: ActionRunRequest) => runAction(payload),
    onSuccess: run => {
      setLastOutput([run.output, run.error].filter(Boolean).join('\n'))
      qc.invalidateQueries({ queryKey: ['action-history'] })
    },
    onError: (err: any) => {
      setLastOutput(err.response?.data?.error || err.message || 'Action failed')
    },
  })

  function buildPayload(sudoPasswordOverride = '') {
    const payload: ActionRunRequest = { server_id: serverId, action }
    if (serviceActions.includes(action)) payload.service_name = serviceName
    if (action === 'change_password') {
      payload.username = username
      payload.new_password = newPassword
    }
    if (action === 'package_install') payload.package_name = packageName
    if (sudoPasswordOverride) payload.sudo_password = sudoPasswordOverride
    if (action === 'custom_command') payload.command = command
    return payload
  }

  function submit() {
    if (requiresSudoPrompt) {
      setSudoPassword('')
      setSudoOpen(true)
      return
    }
    mutation.mutate(buildPayload())
  }

  function runWithSudo() {
    setSudoOpen(false)
    mutation.mutate(buildPayload(sudoPassword))
  }

  function runWithoutSudoPassword() {
    setSudoOpen(false)
    mutation.mutate(buildPayload())
  }

  const actionNeedsService = serviceActions.includes(action)
  const actionNeedsPackage = action === 'package_install'
  const actionNeedsSudo = sudoActions.includes(action)
  const requiresSudoPrompt = actionNeedsSudo && selectedServer?.username !== 'root'
  const formReady =
    serverId > 0 &&
    (!actionNeedsService || serviceName.trim() !== '') &&
    (!actionNeedsPackage || packageName.trim() !== '') &&
    (action !== 'change_password' || (username.trim() !== '' && newPassword !== '')) &&
    (action !== 'custom_command' || command.trim() !== '')
  const canRun = formReady && !mutation.isPending

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">
      <div className="px-6 py-4 bg-gray-900 border-b border-gray-700">
        <h1 className="text-base font-semibold text-white">OpsForge Automation</h1>
        <p className="text-xs text-gray-400 mt-0.5">Run approved playbook-style actions over SSH with an audit trail</p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 xl:grid-cols-[460px_1fr] gap-5">
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-5 h-fit">
          <div className="flex items-center gap-2 mb-4">
            <Wrench size={17} className="text-blue-300" />
            <h2 className="font-semibold text-white">Run Action</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Server</label>
              <select className="input bg-gray-950 border-gray-700 text-white" value={serverId} onChange={e => setServerId(Number(e.target.value))}>
                <option value={0}>Select server</option>
                {servers.map(server => (
                  <option key={server.id} value={server.id}>{server.name} ({server.host})</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1.5">
                {servers.length > 0 ? `${servers.length} servers loaded. Open the dropdown to choose one.` : 'No servers loaded. Check login and backend connection.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Action</label>
              <select className="input bg-gray-950 border-gray-700 text-white" value={action} onChange={e => setAction(e.target.value as AutomationAction)}>
                {Object.entries(actionLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {actionNeedsService && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Service name</label>
                <input className="input bg-gray-950 border-gray-700 text-white" value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="nginx, docker, ssh" />
              </div>
            )}

            {actionNeedsPackage && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Package name</label>
                <input className="input bg-gray-950 border-gray-700 text-white" value={packageName} onChange={e => setPackageName(e.target.value)} placeholder="vim, curl, docker-ce" />
              </div>
            )}

            {action === 'change_password' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">User</label>
                  <input className="input bg-gray-950 border-gray-700 text-white" value={username} onChange={e => setUsername(e.target.value)} placeholder="robotuser" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">New password</label>
                  <input className="input bg-gray-950 border-gray-700 text-white" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                </div>
              </div>
            )}

            {action === 'custom_command' && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Command</label>
                <textarea className="input bg-gray-950 border-gray-700 text-white min-h-24 font-mono" value={command} onChange={e => setCommand(e.target.value)} placeholder="Disabled unless ALLOW_CUSTOM_COMMANDS=true on backend" />
              </div>
            )}

            {(action === 'package_update_cache' || action === 'package_upgrade' || action === 'package_install') && (
              <div className="text-xs text-amber-100 bg-amber-950/50 border border-amber-800 rounded-md p-3">
                This runs package manager commands with sudo on the selected server. Ubuntu/Debian uses apt-get; AlmaLinux/RHEL uses dnf or yum.
              </div>
            )}

            {action === 'custom_command' && (
              <div className="text-xs text-gray-400 bg-gray-950 border border-gray-700 rounded-md p-3">
                Custom commands require backend environment variable <span className="font-mono text-gray-200">ALLOW_CUSTOM_COMMANDS=true</span>. Approved actions above do not need that flag.
              </div>
            )}

            <button onClick={submit} disabled={!canRun} className="btn-primary flex items-center gap-2">
              <Play size={15} />
              {mutation.isPending ? 'Running...' : 'Run'}
            </button>

            {selectedServer && (
              <div className="text-xs text-gray-400 border border-gray-700 rounded-md p-3">
                Target: <span className="text-gray-200">{selectedServer.username}@{selectedServer.host}:{selectedServer.port}</span>
                {actionNeedsSudo && selectedServer.username !== 'root' && (
                  <div className="mt-2 text-amber-200">This action may require sudo/root authentication.</div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-5">
          <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
              <Terminal size={16} className="text-green-300" />
              <h2 className="font-semibold text-white text-sm">Output</h2>
            </div>
            <pre className="min-h-48 max-h-80 overflow-auto p-4 text-xs text-gray-200 bg-gray-950 whitespace-pre-wrap">{lastOutput || 'Run an action to see output here.'}</pre>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
              <KeyRound size={16} className="text-yellow-300" />
              <h2 className="font-semibold text-white text-sm">Recent Actions</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-400 uppercase bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Command</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {history.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No actions have been run yet.</td></tr>
                )}
                {history.map(run => (
                  <tr key={run.id} className="hover:bg-gray-700/30">
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{format(parseISO(run.created_at), 'MMM d, h:mm a')}</td>
                    <td className="px-4 py-3 text-gray-200">{actionLabels[run.action] || run.action}</td>
                    <td className="px-4 py-3">
                      <span className={run.status === 'success' ? 'text-green-300' : 'text-red-300'}>{run.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs max-w-md truncate" title={run.command}>{run.command}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {sudoOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <ShieldCheck size={17} className="text-amber-300" />
                <h2 className="font-semibold text-white">Sudo authentication</h2>
              </div>
              <button onClick={() => setSudoOpen(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-300">
                {selectedServer?.username}@{selectedServer?.host} may require a sudo/root password for <span className="text-white">{actionLabels[action]}</span>.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Sudo / root password</label>
                <input
                  className="input bg-gray-950 border-gray-700 text-white"
                  type="password"
                  value={sudoPassword}
                  onChange={e => setSudoPassword(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1.5">This password is used only for this run and is not saved.</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button onClick={() => setSudoOpen(false)} className="text-sm px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200">
                  Cancel
                </button>
                <button onClick={runWithoutSudoPassword} className="text-sm px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200">
                  Run without password
                </button>
                <button onClick={runWithSudo} disabled={!sudoPassword} className="btn-primary disabled:opacity-50">
                  Run with sudo password
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
