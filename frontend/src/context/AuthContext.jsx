import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

function getSessionItem(key) {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function setSessionItem(key, value) {
  try {
    sessionStorage.setItem(key, value)
  } catch {}
}

function removeSessionItem(key) {
  try {
    sessionStorage.removeItem(key)
  } catch {}
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    // Rehydrate from sessionStorage on page refresh
    const id = getSessionItem('user_id')
    const username = getSessionItem('username')
    const createdAt = getSessionItem('created_at')
    return id ? { user_id: id, username, created_at: createdAt } : null
  })

  function login(data) {
    setSessionItem('user_id', data.user_id)
    setSessionItem('username', data.username)
    if (data.created_at) setSessionItem('created_at', data.created_at)
    else removeSessionItem('created_at')
    setUser({ user_id: data.user_id, username: data.username, created_at: data.created_at ?? null })
  }

  function logout() {
    removeSessionItem('user_id')
    removeSessionItem('username')
    removeSessionItem('created_at')
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
