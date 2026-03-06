import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    // Rehydrate from sessionStorage on page refresh
    const id       = sessionStorage.getItem('user_id')
    const username = sessionStorage.getItem('username')
    return id ? { user_id: id, username } : null
  })

  function login(data) {
    sessionStorage.setItem('user_id',  data.user_id)
    sessionStorage.setItem('username', data.username)
    setUser({ user_id: data.user_id, username: data.username })
  }

  function logout() {
    sessionStorage.removeItem('user_id')
    sessionStorage.removeItem('username')
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
