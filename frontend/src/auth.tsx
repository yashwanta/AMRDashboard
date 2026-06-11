import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { login as loginRequest } from './api/client'

interface AuthState {
  token: string | null
  username: string | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem('robowatch_token'))
  const [username, setUsername] = useState(() => localStorage.getItem('robowatch_user'))

  const value = useMemo<AuthState>(() => ({
    token,
    username,
    isAuthenticated: Boolean(token),
    login: async (nextUsername, password) => {
      const response = await loginRequest(nextUsername, password)
      localStorage.setItem('robowatch_token', response.token)
      localStorage.setItem('robowatch_user', response.username)
      setToken(response.token)
      setUsername(response.username)
    },
    logout: () => {
      localStorage.removeItem('robowatch_token')
      localStorage.removeItem('robowatch_user')
      setToken(null)
      setUsername(null)
    },
  }), [token, username])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return ctx
}
