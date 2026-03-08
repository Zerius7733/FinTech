import { createContext, useContext, useState } from 'react'

const LoginModalContext = createContext()

export function LoginModalProvider({ children }) {
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [surveyModalOpen, setSurveyModalOpen] = useState(false)

  return (
    <LoginModalContext.Provider value={{ loginModalOpen, setLoginModalOpen, surveyModalOpen, setSurveyModalOpen }}>
      {children}
    </LoginModalContext.Provider>
  )
}

export function useLoginModal() {
  const context = useContext(LoginModalContext)
  if (!context) {
    throw new Error('useLoginModal must be used within a LoginModalProvider')
  }
  return context
}
