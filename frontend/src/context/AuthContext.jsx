import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    // Rehydrate from sessionStorage on page refresh
    const id       = sessionStorage.getItem('user_id')
    const username = sessionStorage.getItem('username')
    const createdAt = sessionStorage.getItem('created_at')
    return id ? { user_id: id, username, created_at: createdAt } : null
  })

  function login(data) {
    sessionStorage.setItem('user_id',  data.user_id)
    sessionStorage.setItem('username', data.username)
    if (data.created_at) sessionStorage.setItem('created_at', data.created_at)
    else sessionStorage.removeItem('created_at')
    setUser({ user_id: data.user_id, username: data.username, created_at: data.created_at ?? null })
  }

  function logout() {
    sessionStorage.removeItem('user_id')
    sessionStorage.removeItem('username')
    sessionStorage.removeItem('created_at')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
