import { Routes, Route, Navigate } from 'react-router-dom'
import Globe   from './pages/Globe.jsx'
import Survey  from './pages/Survey.jsx'
import Profile from './pages/Profile.jsx'
import Stocks from './pages/Stocks.jsx'
import Commodities from './pages/Commodities.jsx'
import Crypto  from './pages/Crypto.jsx'
import Login   from './pages/Login.jsx'
import Theme   from './pages/Theme.jsx'
import LoginModal from './components/LoginModal.jsx'
import SurveyModal from './components/SurveyModal.jsx'
import { useLoginModal } from './context/LoginModalContext.jsx'

export default function App() {
  const { loginModalOpen, setLoginModalOpen, surveyModalOpen, setSurveyModalOpen } = useLoginModal()

  return (
    <>
      <Routes>
        <Route path="/"         element={<Globe />} />
        <Route path="/login"    element={<Login />} />
        <Route path="/survey"   element={<Survey />} />
        <Route path="/profile"  element={<Profile />} />
        <Route path="/stocks"   element={<Stocks />} />
        <Route path="/commodities" element={<Commodities />} />
        <Route path="/crypto"   element={<Crypto />} />
        <Route path="/theme"    element={<Theme />} />
        <Route path="*"         element={<Navigate to="/" replace />} />
      </Routes>

      <LoginModal
        open={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onOpenSurvey={() => setSurveyModalOpen(true)}
      />
      <SurveyModal
        open={surveyModalOpen}
        onClose={() => setSurveyModalOpen(false)}
      />
    </>
  )
}
