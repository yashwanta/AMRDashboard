import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { login as loginRequest } from './api/client'
import type { UserRole } from './types'

interface AuthState {
  token: string | null
  username: string | null
  role: UserRole | null
  isAuthenticated: boolean
  canAdmin: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => sessionStorage.getItem('siteops_token'))
  const [username, setUsername] = useState(() => sessionStorage.getItem('siteops_user'))
  const [role, setRole] = useState<UserRole | null>(() => sessionStorage.getItem('siteops_role') as UserRole | null)

  const value = useMemo<AuthState>(() => ({
    token,
    username,
    role,
    isAuthenticated: Boolean(token),
    canAdmin: role === 'Super Admin' || role === 'Global Admin' || role === 'Location Admin',
    login: async (nextUsername, password) => {
      const response = await loginRequest(nextUsername, password)
      sessionStorage.setItem('siteops_token', response.token)
      sessionStorage.setItem('siteops_user', response.username)
      sessionStorage.setItem('siteops_role', response.role)
      localStorage.removeItem('robowatch_token')
      localStorage.removeItem('robowatch_user')
      setToken(response.token)
      setUsername(response.username)
      setRole(response.role)
    },
    logout: () => {
      sessionStorage.removeItem('siteops_token')
      sessionStorage.removeItem('siteops_user')
      sessionStorage.removeItem('siteops_role')
      localStorage.removeItem('robowatch_token')
      localStorage.removeItem('robowatch_user')
      setToken(null)
      setUsername(null)
      setRole(null)
    },
  }), [token, username, role])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return ctx
}
