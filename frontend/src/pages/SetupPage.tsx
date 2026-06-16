import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { KeyRound, Plus, Save, Trash2, Users } from 'lucide-react'
import { createUser, deleteUser, getUsers, updateUser } from '../api/client'
import type { AppUser, UserRole } from '../types'

const roles: Array<{ role: UserRole; description: string; badge: string }> = [
  { role: 'Super Admin', description: 'Full access — user management, all CRUD, system setup', badge: 'border-orange-500/60 bg-orange-950/50 text-orange-300' },
  { role: 'Global Admin', description: 'Full CRUD on all locations, devices and switches', badge: 'border-cyan-500/60 bg-cyan-950/50 text-cyan-300' },
  { role: 'Global Admin Read Only', description: 'View everything across all locations — no changes', badge: 'border-blue-500/60 bg-blue-950/50 text-blue-300' },
  { role: 'Location Admin', description: 'CRUD scoped to their assigned location only', badge: 'border-yellow-500/60 bg-yellow-950/50 text-yellow-300' },
  { role: 'IT User', description: 'Read-only access — view only, no modifications', badge: 'border-slate-500/60 bg-slate-800 text-slate-300' },
]

export default function SetupPage() {
  const qc = useQueryClient()
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: getUsers })
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('IT User')
  const [location, setLocation] = useState('')
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [editPassword, setEditPassword] = useState('')
  const [passwordUserId, setPasswordUserId] = useState<number>(0)
  const [passwordOnly, setPasswordOnly] = useState('')

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      setUsername('')
      setPassword('')
      setRole('IT User')
      setLocation('')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ user, password }: { user: AppUser; password?: string }) =>
      updateUser(user.id, { role: user.role, location: user.location, status: user.status, password }),
    onSuccess: () => {
      setEditing(null)
      setEditPassword('')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  const passwordMutation = useMutation({
    mutationFn: ({ user, password }: { user: AppUser; password: string }) =>
      updateUser(user.id, { role: user.role, location: user.location, status: user.status, password }),
    onSuccess: () => {
      setPasswordUserId(0)
      setPasswordOnly('')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    createMutation.mutate({ username, password, role, location, status: 'active' })
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">
      <div className="px-6 py-4 bg-gray-900 border-b border-gray-700">
        <h1 className="text-base font-semibold text-white">Setup</h1>
        <p className="text-xs text-gray-400 mt-0.5">Create users, assign access level, and manage admin roles.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 xl:grid-cols-[460px_1fr] gap-5">
        <section className="space-y-5">
          <div className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
              <KeyRound size={16} className="text-yellow-300" />
              <h2 className="text-cyan-300 font-semibold text-sm">Role Reference</h2>
            </div>
            <div className="divide-y divide-gray-800">
              {roles.map(item => (
                <div key={item.role} className="grid grid-cols-[160px_1fr] gap-3 px-4 py-3 bg-gray-900/80">
                  <span className={`text-xs font-semibold text-center rounded-full border px-3 py-1 ${item.badge}`}>{item.role}</span>
                  <span className="text-xs text-slate-400">{item.description}</span>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={submit} className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Plus size={17} className="text-blue-300" />
              <h2 className="font-semibold text-white">Create User</h2>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Username</label>
              <input className="input bg-gray-950 border-gray-700 text-white" value={username} onChange={e => setUsername(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
              <input className="input bg-gray-950 border-gray-700 text-white" type="password" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Role</label>
              <select className="input bg-gray-950 border-gray-700 text-white" value={role} onChange={e => setRole(e.target.value as UserRole)}>
                {roles.map(item => <option key={item.role} value={item.role}>{item.role}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Location</label>
              <input className="input bg-gray-950 border-gray-700 text-white" value={location} onChange={e => setLocation(e.target.value)} placeholder="Springfield, Hopkinsville, Shelbyville" />
            </div>
            <button className="btn-primary flex items-center gap-2" disabled={createMutation.isPending}>
              <Save size={15} />
              {createMutation.isPending ? 'Creating...' : 'Create User'}
            </button>
          </form>

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound size={17} className="text-yellow-300" />
              <h2 className="font-semibold text-white">Change Password</h2>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">User</label>
              <select className="input bg-gray-950 border-gray-700 text-white" value={passwordUserId} onChange={e => setPasswordUserId(Number(e.target.value))}>
                <option value={0}>Select user</option>
                {users.map(user => <option key={user.id} value={user.id}>{user.username} ({user.role})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">New password</label>
              <input className="input bg-gray-950 border-gray-700 text-white" type="password" value={passwordOnly} onChange={e => setPasswordOnly(e.target.value)} />
            </div>
            <button
              className="btn-primary flex items-center gap-2"
              disabled={!passwordUserId || !passwordOnly || passwordMutation.isPending}
              onClick={() => {
                const user = users.find(u => u.id === passwordUserId)
                if (user) passwordMutation.mutate({ user, password: passwordOnly })
              }}
            >
              <Save size={15} />
              {passwordMutation.isPending ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </section>

        <section className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden h-fit">
          <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
            <Users size={16} className="text-green-300" />
            <h2 className="font-semibold text-white text-sm">Users</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-400 uppercase bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {users.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No database users yet. Built-in admin login still works.</td></tr>
              )}
              {users.map(user => {
                const isEditing = editing?.id === user.id
                return (
                  <tr key={user.id} className="align-top">
                    <td className="px-4 py-3 text-gray-200 font-medium">{user.username}</td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select className="input-sm bg-gray-950 border-gray-700 text-white" value={editing.role} onChange={e => setEditing({ ...editing, role: e.target.value as UserRole })}>
                          {roles.map(item => <option key={item.role} value={item.role}>{item.role}</option>)}
                        </select>
                      ) : user.role}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input className="input-sm bg-gray-950 border-gray-700 text-white" value={editing.location} onChange={e => setEditing({ ...editing, location: e.target.value })} />
                      ) : user.location || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select className="input-sm bg-gray-950 border-gray-700 text-white" value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value as 'active' | 'disabled' })}>
                          <option value="active">active</option>
                          <option value="disabled">disabled</option>
                        </select>
                      ) : (
                        <span className={user.status === 'active' ? 'text-green-300' : 'text-red-300'}>{user.status}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{format(parseISO(user.updated_at), 'MMM d, h:mm a')}</td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="space-y-2">
                          <input className="input-sm bg-gray-950 border-gray-700 text-white w-44" type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="New password optional" />
                          <div className="flex gap-2">
                            <button className="btn-primary px-3 py-1.5" onClick={() => updateMutation.mutate({ user: editing, password: editPassword || undefined })}>Save</button>
                            <button className="btn-ghost px-3 py-1.5" onClick={() => setEditing(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button className="btn-ghost px-3 py-1.5" onClick={() => setEditing(user)}>Edit</button>
                          <button className="text-red-300 hover:text-red-200 p-1.5" onClick={() => deleteMutation.mutate(user.id)} title="Delete user">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
