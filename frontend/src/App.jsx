import { Routes, Route, Navigate } from 'react-router-dom'
import Globe   from './pages/Globe.jsx'
import Survey  from './pages/Survey.jsx'
import Profile from './pages/Profile.jsx'
import Settings from './pages/Settings.jsx'
import Crypto  from './pages/Crypto.jsx'
import Login   from './pages/Login.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/"         element={<Globe />} />
      <Route path="/login"    element={<Login />} />
      <Route path="/survey"   element={<Survey />} />
      <Route path="/profile"  element={<Profile />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/crypto"   element={<Crypto />} />
      <Route path="*"         element={<Navigate to="/" replace />} />
    </Routes>
  )
}