import { useState } from 'react'
import type { Server, ServerRequest } from '../../types'
import { testConnection } from '../../api/client'
import { CheckCircle, XCircle, Loader } from 'lucide-react'

interface Props {
  initial?: Server
  onSubmit: (data: ServerRequest) => Promise<void>
  onCancel: () => void
}

const inputCls = "w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
const labelCls = "block text-xs font-medium text-gray-400 mb-1"

export default function ServerForm({ initial, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<ServerRequest>({
    name: initial?.name ?? '', host: initial?.host ?? '', port: initial?.port ?? 22,
    username: initial?.username ?? '', auth_type: initial?.auth_type ?? 'password',
    password: '', private_key: '',
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null)

  const set = (k: keyof ServerRequest, v: string | number) => setForm(f => ({ ...f, [k]: v }))

  const handleTest = async () => {
    setTesting(true); setTestResult(null)
    const res = await testConnection(form)
    setTestResult({ success: res.success, msg: res.error ?? res.info ?? '' })
    setTesting(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); await onSubmit(form); setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelCls}>Display name</label>
          <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} required placeholder="Production RDS Server" />
        </div>
        <div>
          <label className={labelCls}>Host / IP</label>
          <input className={inputCls} value={form.host} onChange={e => set('host', e.target.value)} required placeholder="192.168.1.10" />
        </div>
        <div>
          <label className={labelCls}>SSH port</label>
          <input className={inputCls} type="number" value={form.port} onChange={e => set('port', parseInt(e.target.value))} min={1} max={65535} />
        </div>
        <div>
          <label className={labelCls}>Username</label>
          <input className={inputCls} value={form.username} onChange={e => set('username', e.target.value)} required placeholder="logpull" />
        </div>
        <div>
          <label className={labelCls}>Auth type</label>
          <select className={inputCls} value={form.auth_type} onChange={e => set('auth_type', e.target.value)}>
            <option value="password">Password</option>
            <option value="key">Private Key</option>
          </select>
        </div>

        {form.auth_type === 'password' ? (
          <div className="col-span-2">
            <label className={labelCls}>Password {initial && <span className="text-gray-500 font-normal">(leave blank to keep)</span>}</label>
            <input className={inputCls} type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" />
          </div>
        ) : (
          <div className="col-span-2">
            <label className={labelCls}>Private key (PEM) {initial && <span className="text-gray-500 font-normal">(leave blank to keep)</span>}</label>
            <textarea className={`${inputCls} font-mono text-xs`} rows={4} value={form.private_key} onChange={e => set('private_key', e.target.value)} placeholder="-----BEGIN RSA PRIVATE KEY-----" />
          </div>
        )}
      </div>

      {testResult && (
        <div className={`flex items-center gap-2 text-sm p-3 rounded-lg border ${testResult.success ? 'bg-green-900/30 text-green-300 border-green-700' : 'bg-red-900/30 text-red-300 border-red-700'}`}>
          {testResult.success ? <CheckCircle size={15} /> : <XCircle size={15} />}
          <span>{testResult.success ? 'Connection successful' : testResult.msg}</span>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <button type="button" onClick={handleTest} disabled={testing || !form.host || !form.username}
          className="text-sm text-indigo-400 hover:text-indigo-300 disabled:opacity-40 flex items-center gap-1 transition-colors">
          {testing && <Loader size={13} className="animate-spin" />}
          Test connection
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel}
            className="text-sm px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="text-sm px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-60">
            {saving ? 'Saving…' : initial ? 'Update' : 'Add Server'}
          </button>
        </div>
      </div>
    </form>
  )
}
