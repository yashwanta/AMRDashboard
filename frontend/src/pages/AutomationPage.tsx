import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { CheckCircle, Copy, KeyRound, Play, ShieldCheck, Terminal, Wrench } from 'lucide-react'
import { getActionHistory, getServers, runAction } from '../api/client'
import type { ActionRunRequest, AutomationAction } from '../types'

const actionLabels: Record<AutomationAction, string> = {
  privilege_check: 'Check privilege access',
  service_status: 'Check service status',
  service_restart: 'Restart service',
  service_start: 'Start service',
  service_stop: 'Stop service',
  service_enable: 'Enable service',
  service_disable: 'Disable service',
  package_update_cache: 'Update package cache (Ubuntu/AlmaLinux)',
  package_list_upgrades: 'List available upgrades',
  package_upgrade_dry_run: 'Preview upgrade',
  package_upgrade: 'Run system upgrade (Ubuntu/AlmaLinux)',
  package_install: 'Install package (Ubuntu/AlmaLinux)',
  remediate_cve_2026_31431_linux_signed: 'Remediate CVE-2026-31431 kernel packages',
  remediate_cve_2026_43494_linux_signed_upgrade: 'Remediate CVE-2026-43494 kernel packages',
  remediate_cve_2026_43494_ubuntu_generic_kernel: 'Remediate CVE-2026-43494 Ubuntu generic kernel',
  system_reboot: 'Restart server/workstation',
  approved_custom_command: 'Approved custom command',
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
  'remediate_cve_2026_31431_linux_signed',
  'remediate_cve_2026_43494_linux_signed_upgrade',
  'remediate_cve_2026_43494_ubuntu_generic_kernel',
  'system_reboot',
  'approved_custom_command',
]

const approvedCommandTemplates = [
  { label: 'Update apt cache', command: 'apt-get update' },
  { label: 'Install package', command: 'apt-get install -y ' },
  { label: 'Restart service', command: 'systemctl restart ' },
  { label: 'Restart server/workstation', command: 'systemctl reboot' },
  { label: 'Disk usage', command: 'df -h' },
  { label: 'Memory', command: 'free -h' },
  { label: 'Kernel version', command: 'uname -r' },
]

export default function AutomationPage() {
  const qc = useQueryClient()
  const { data: servers = [] } = useQuery({ queryKey: ['servers'], queryFn: getServers })
  const { data: history = [] } = useQuery({ queryKey: ['action-history'], queryFn: getActionHistory, refetchInterval: 10_000 })
  const [serverId, setServerId] = useState<number>(0)
  const [action, setAction] = useState<AutomationAction>('service_status')
  const [serviceName, setServiceName] = useState('ssh')
  const [packageName, setPackageName] = useState('')
  const [command, setCommand] = useState('')
  const [lastOutput, setLastOutput] = useState('')
  const [activeRunId, setActiveRunId] = useState<number | null>(null)
  const [runStartedAt, setRunStartedAt] = useState<Date | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [setupPublicKey, setSetupPublicKey] = useState('')
  const [setupCopied, setSetupCopied] = useState<string | null>(null)

  const selectedServer = useMemo(
    () => servers.find(s => s.id === serverId),
    [servers, serverId]
  )

  const setupUser = selectedServer?.username?.trim() || 'robowatch'
  const setupHost = selectedServer?.host || 'target-server'
  const setupPort = selectedServer?.port || 22

  const bootstrapScript = useMemo(() => {
    const keyLine = setupPublicKey.trim() || 'PASTE_PUBLIC_KEY_HERE'
    return [
      '# Run this manually on the target server as an admin user.',
      '# It creates or updates the automation account for OpsForge.',
      'set -e',
      `OPSFORGE_USER='${setupUser.replace(/'/g, "'\\''")}'`,
      `OPSFORGE_KEY='${keyLine.replace(/'/g, "'\\''")}'`,
      '',
      'if [ "$(id -u)" -ne 0 ]; then',
      '  echo "Run this bootstrap with sudo or as root."',
      '  exit 1',
      'fi',
      '',
      'if ! id "$OPSFORGE_USER" >/dev/null 2>&1; then',
      '  useradd -m -s /bin/bash "$OPSFORGE_USER"',
      'fi',
      '',
      'install -d -m 700 -o "$OPSFORGE_USER" -g "$OPSFORGE_USER" "/home/$OPSFORGE_USER/.ssh"',
      'cat > "/home/$OPSFORGE_USER/.ssh/authorized_keys" <<OPSFORGE_AUTH_KEY',
      '$OPSFORGE_KEY',
      'OPSFORGE_AUTH_KEY',
      'chown "$OPSFORGE_USER:$OPSFORGE_USER" "/home/$OPSFORGE_USER/.ssh/authorized_keys"',
      'chmod 600 "/home/$OPSFORGE_USER/.ssh/authorized_keys"',
      '',
      'cat > "/etc/sudoers.d/opsforge-$OPSFORGE_USER" <<EOF',
      '$OPSFORGE_USER ALL=(root) NOPASSWD: /bin/sh, /usr/bin/sh',
      'EOF',
      'chmod 440 "/etc/sudoers.d/opsforge-$OPSFORGE_USER"',
      'visudo -cf "/etc/sudoers.d/opsforge-$OPSFORGE_USER"',
      '',
      'echo "OpsForge bootstrap complete."',
      'echo "Next: update the server record to use this username and private key, then run Check privilege access."',
    ].join('\n')
  }, [setupPublicKey, setupUser])

  const mutation = useMutation({
    mutationFn: (payload: ActionRunRequest) => runAction(payload),
    onSuccess: run => {
      setActiveRunId(run.id)
      setRunStartedAt(new Date(run.created_at))
      setElapsedSeconds(0)
      setLastOutput([`Started ${actionLabels[run.action] || run.action}.`, run.output, run.error].filter(Boolean).join('\n'))
      qc.invalidateQueries({ queryKey: ['action-history'] })
    },
    onError: (err: any) => {
      setLastOutput(err.response?.data?.error || err.message || 'Action failed')
    },
  })

  const activeRun = useMemo(
    () => history.find(run => run.id === activeRunId),
    [history, activeRunId]
  )

  function privilegeHelp(username = 'automation-user') {
    return [
      'Secure privilege setup required:',
      `- The SSH user "${username}" is not root and does not have passwordless sudo for this action.`,
      '- This app will not collect, store, transmit, or pipe sudo passwords.',
      '- Safe options: connect with a root SSH account, or configure passwordless sudo on the target for a dedicated automation user.',
      '- After changing the target, run "Check privilege access" before patch, remediation, or reboot actions.',
      '',
      'Example target-side setup, run manually as root:',
      `visudo -f /etc/sudoers.d/robowatch-${username}`,
      `${username} ALL=(root) NOPASSWD: /bin/sh, /usr/bin/sh`,
      '',
      'Note: allowing /bin/sh lets the approved RoboWatch scripts run as root. Use a dedicated SSH account and restrict SSH access to this app host.',
    ].join('\n')
  }

  function outputNeedsPrivilegeHelp(text: string) {
    return /sudo:.*password is required|a password is required|passwordless sudo/i.test(text)
  }

  function runOutput(run: typeof history[number]) {
    const text = [run.output, run.error].filter(Boolean).join('\n')
    if (!text) return `${actionLabels[run.action] || run.action} completed successfully, but the target did not return output.`
    if (!outputNeedsPrivilegeHelp(text)) return text
    const runServer = servers.find(server => server.id === run.server_id)
    return `${text}\n\n${privilegeHelp(runServer?.username || selectedServer?.username)}`
  }

  function showRun(run: typeof history[number]) {
    setActiveRunId(run.id)
    setRunStartedAt(new Date(run.created_at))
    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - new Date(run.created_at).getTime()) / 1000)))
    setLastOutput(run.status === 'running' ? run.output || 'Queued. Connecting over SSH...' : runOutput(run))
  }

  useEffect(() => {
    if (!activeRun || activeRun.status === 'running') return
    setLastOutput(runOutput(activeRun))
  }, [activeRun])

  useEffect(() => {
    if (!runStartedAt || (activeRun && activeRun.status !== 'running')) return
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - runStartedAt.getTime()) / 1000)))
      qc.invalidateQueries({ queryKey: ['action-history'] })
    }, 3000)
    return () => window.clearInterval(timer)
  }, [activeRun?.status, qc, runStartedAt])

  function buildPayload() {
    const payload: ActionRunRequest = { server_id: serverId, action }
    if (serviceActions.includes(action)) payload.service_name = serviceName
    if (action === 'package_install') payload.package_name = packageName
    if (action === 'approved_custom_command') payload.command = command
    return payload
  }

  function submit() {
    mutation.mutate(buildPayload())
  }

  async function copyText(label: string, text: string) {
    await navigator.clipboard.writeText(text)
    setSetupCopied(label)
    window.setTimeout(() => setSetupCopied(null), 1800)
  }

  function runPrivilegeCheck() {
    if (!serverId) return
    setAction('privilege_check')
    mutation.mutate({ server_id: serverId, action: 'privilege_check' })
  }

  const actionNeedsService = serviceActions.includes(action)
  const actionNeedsPackage = action === 'package_install'
  const actionNeedsSudo = sudoActions.includes(action)
  const formReady =
    serverId > 0 &&
    (!actionNeedsService || serviceName.trim() !== '') &&
    (!actionNeedsPackage || packageName.trim() !== '') &&
    (action !== 'approved_custom_command' || command.trim() !== '')
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

            {action === 'approved_custom_command' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Approved command</label>
                  <textarea
                    className="input bg-gray-950 border-gray-700 text-white min-h-24 font-mono"
                    value={command}
                    onChange={e => setCommand(e.target.value)}
                    placeholder="uname -r"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {approvedCommandTemplates.map(template => (
                    <button
                      key={template.label}
                      type="button"
                      onClick={() => setCommand(template.command)}
                      className="text-xs px-2 py-1 rounded-md border border-gray-700 bg-gray-950 hover:bg-gray-700 text-gray-300"
                    >
                      {template.label}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-gray-400 bg-gray-950 border border-gray-700 rounded-md p-3">
                  Approved custom commands allow package, systemctl, journal, disk, memory, uptime, and uname commands. Privileged commands require the SSH account to be root or have passwordless sudo configured outside this app.
                </div>
              </div>
            )}

            {action === 'privilege_check' && (
              <div className="text-xs text-blue-100 bg-blue-950/40 border border-blue-800 rounded-md p-3">
                Checks whether the SSH user is root or has passwordless sudo. Run this before patch, install, upgrade, remediation, or reboot actions.
              </div>
            )}

            {(action === 'package_update_cache' || action === 'package_upgrade' || action === 'package_install') && (
              <div className="text-xs text-amber-100 bg-amber-950/50 border border-amber-800 rounded-md p-3">
                This runs package manager commands on the selected server. Ubuntu/Debian uses apt-get; AlmaLinux/RHEL uses dnf or yum. Privileged actions require root or passwordless sudo.
              </div>
            )}

            {action === 'remediate_cve_2026_31431_linux_signed' && (
              <div className="text-xs text-amber-100 bg-amber-950/50 border border-amber-800 rounded-md p-3">
                Runs an Ubuntu apt remediation that updates package cache, detects installed kernel meta/image packages, upgrades only those packages, then prints installed kernels, running kernel, and reboot-required status.
              </div>
            )}

            {action === 'remediate_cve_2026_43494_linux_signed_upgrade' && (
              <div className="text-xs text-amber-100 bg-amber-950/50 border border-amber-800 rounded-md p-3">
                Runs an Ubuntu 24.04 apt remediation that detects installed kernel meta/image packages, upgrades only those packages, then prints installed kernels, running kernel, and reboot-required status.
              </div>
            )}

            {action === 'remediate_cve_2026_43494_ubuntu_generic_kernel' && (
              <div className="text-xs text-amber-100 bg-amber-950/50 border border-amber-800 rounded-md p-3">
                Runs an Ubuntu 24.2/24.04 generic-kernel remediation that detects installed kernel packages, upgrades only applicable kernel packages, then prints installed kernels, running kernel, and reboot-required status.
              </div>
            )}

            {action === 'system_reboot' && (
              <div className="text-xs text-red-100 bg-red-950/40 border border-red-800 rounded-md p-3">
                This restarts the selected server or workstation. The SSH session may disconnect while the machine reboots.
              </div>
            )}

            <button onClick={submit} disabled={!canRun} className="btn-primary flex items-center gap-2">
              <Play size={15} />
              {mutation.isPending ? 'Running...' : 'Run'}
            </button>

            {selectedServer && (
              <div className="text-xs text-gray-400 border border-gray-700 rounded-md p-3">
                Target: <span className="text-gray-200">{selectedServer.username}@{selectedServer.host}:{selectedServer.port}</span>
                {actionNeedsSudo && (
                  <div className="mt-2 text-amber-200">
                    Privileged actions require root SSH or passwordless sudo on the target. This app does not collect sudo passwords. Use Check privilege access first.
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-5">
          <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
              <ShieldCheck size={16} className="text-cyan-300" />
              <h2 className="font-semibold text-white text-sm">OpsForge Setup Wizard</h2>
            </div>
            <div className="p-4 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
              <div className="space-y-3 text-sm">
                <div className="rounded-md border border-gray-700 bg-gray-950 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Selected target</p>
                  <p className="font-mono text-gray-200">{setupUser}@{setupHost}:{setupPort}</p>
                  <p className="text-xs text-gray-500 mt-2">Use a dedicated user like robowatch when possible. Root SSH also works if your policy allows it.</p>
                </div>
                <div className="space-y-2">
                  {[
                    'Generate an SSH key on the machine running this app.',
                    'Paste the public key below.',
                    'Run the generated bootstrap script on the target as root or with sudo.',
                    'Edit the server record to use Private Key auth.',
                    'Run Check privilege access before patching.',
                  ].map((step, idx) => (
                    <div key={step} className="flex gap-2 text-xs text-gray-300">
                      <span className="w-5 h-5 rounded-full bg-cyan-950 text-cyan-200 border border-cyan-800 flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={runPrivilegeCheck}
                  disabled={!serverId || mutation.isPending}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  <CheckCircle size={15} />
                  Check privilege access
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Public key for authorized_keys</label>
                  <textarea
                    className="input bg-gray-950 border-gray-700 text-white min-h-20 font-mono text-xs"
                    value={setupPublicKey}
                    onChange={e => setSetupPublicKey(e.target.value)}
                    placeholder="ssh-ed25519 AAAA... ansible patching key"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copyText('keygen', 'ssh-keygen -t ed25519 -f ~/.ssh/ansible_patch_key -C "ansible patching key"')}
                    className="text-xs px-3 py-1.5 rounded-md border border-gray-700 bg-gray-950 hover:bg-gray-700 text-gray-300 flex items-center gap-1.5"
                  >
                    <Copy size={13} />
                    Copy keygen command
                  </button>
                  <button
                    type="button"
                    onClick={() => copyText('script', bootstrapScript)}
                    className="text-xs px-3 py-1.5 rounded-md border border-gray-700 bg-gray-950 hover:bg-gray-700 text-gray-300 flex items-center gap-1.5"
                  >
                    <Copy size={13} />
                    Copy bootstrap script
                  </button>
                  {setupCopied && <span className="text-xs text-green-300 self-center">Copied {setupCopied}</span>}
                </div>
                <pre className="max-h-72 overflow-auto p-3 text-xs text-gray-200 bg-gray-950 border border-gray-700 rounded-md whitespace-pre-wrap">{bootstrapScript}</pre>
                <p className="text-xs text-amber-200 bg-amber-950/40 border border-amber-800 rounded-md p-3">
                  This app still does not collect sudo passwords. The bootstrap is a one-time target-side admin step that enables approved OpsForge scripts to run without password prompts.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
              <Terminal size={16} className="text-green-300" />
              <h2 className="font-semibold text-white text-sm">Output</h2>
            </div>
            {activeRun && (
              <div className="px-4 py-3 border-b border-gray-700 bg-gray-900/70 text-xs text-gray-300 flex flex-wrap items-center gap-3">
                <span className={activeRun.status === 'running' ? 'text-blue-300' : activeRun.status === 'success' ? 'text-green-300' : 'text-red-300'}>
                  {activeRun.status === 'running' ? `Running ${elapsedSeconds}s` : activeRun.status}
                </span>
                <span>{actionLabels[activeRun.action] || activeRun.action}</span>
                <span className="font-mono text-gray-500 truncate max-w-full">{activeRun.command}</span>
              </div>
            )}
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
                  <tr key={run.id} onClick={() => showRun(run)} className="hover:bg-gray-700/30 cursor-pointer">
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{format(parseISO(run.created_at), 'MMM d, h:mm a')}</td>
                    <td className="px-4 py-3 text-gray-200">{actionLabels[run.action] || run.action}</td>
                    <td className="px-4 py-3">
                      <span className={run.status === 'running' ? 'text-blue-300' : run.status === 'success' ? 'text-green-300' : 'text-red-300'}>{run.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs max-w-md truncate" title={run.command}>{run.command}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

    </div>
  )
}
