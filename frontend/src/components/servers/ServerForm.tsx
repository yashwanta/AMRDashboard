import { useState } from 'react'
import type { Server, ServerRequest } from '../../types'
import { testConnection } from '../../api/client'
import { CheckCircle, XCircle, Loader } from 'lucide-react'

interface Props {
  initial?: Server
  onSubmit: (data: ServerRequest) => Promise<void>
  onCancel: () => void
}

export default function ServerForm({ initial, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<ServerRequest>({
    name:       initial?.name ?? '',
    host:       initial?.host ?? '',
    port:       initial?.port ?? 22,
    username:   initial?.username ?? '',
    auth_type:  initial?.auth_type ?? 'password',
    password:   '',
    private_key: '',
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null)

  const set = (k: keyof ServerRequest, v: string | number) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    const res = await testConnection(form)
    setTestResult({ success: res.success, msg: res.error ?? res.info ?? '' })
    setTesting(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await onSubmit(form)
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
          <input className="input" value={form.name} onChange={e => set('name', e.target.value)} required placeholder="Production Web Server" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Host / IP</label>
          <input className="input" value={form.host} onChange={e => set('host', e.target.value)} required placeholder="192.168.1.10" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">SSH Port</label>
          <input className="input" type="number" value={form.port} onChange={e => set('port', parseInt(e.target.value))} min={1} max={65535} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
          <input className="input" value={form.username} onChange={e => set('username', e.target.value)} required placeholder="root" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Auth Type</label>
          <select className="input" value={form.auth_type} onChange={e => set('auth_type', e.target.value)}>
            <option value="password">Password</option>
            <option value="key">Private Key</option>
          </select>
        </div>

        {form.auth_type === 'password' ? (
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password {initial && <span className="text-gray-400 font-normal">(leave blank to keep existing)</span>}
            </label>
            <input className="input" type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" />
          </div>
        ) : (
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Private Key (PEM) {initial && <span className="text-gray-400 font-normal">(leave blank to keep existing)</span>}
            </label>
            <textarea
              className="input font-mono text-xs"
              rows={5}
              value={form.private_key}
              onChange={e => set('private_key', e.target.value)}
              placeholder="-----BEGIN RSA PRIVATE KEY-----"
            />
          </div>
        )}
      </div>

      {testResult && (
        <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {testResult.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
          <span>{testResult.success ? 'Connection successful' : testResult.msg}</span>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !form.host || !form.username}
          className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-40 flex items-center gap-1"
        >
          {testing && <Loader size={13} className="animate-spin" />}
          Test Connection
        </button>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : initial ? 'Update Server' : 'Add Server'}
          </button>
        </div>
      </div>
    </form>
  )
}
