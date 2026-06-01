import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LabelsProvider } from './context/LabelsContext'
import LoginPage from './pages/auth/LoginPage'
import Layout from './components/ui/Layout'
import DashboardPage from './pages/dashboard/DashboardPage'
import LeadsPage from './pages/leads/LeadsPage'
import PipelinePage from './pages/pipeline/PipelinePage'
import ContactsPage from './pages/contacts/ContactsPage'
import AutomationsPage from './pages/automations/AutomationsPage'
import FormsPage from './pages/forms/FormsPage'
import SettingsPage from './pages/settings/SettingsPage'
import ImportPage from './pages/import/ImportPage'
import ReportsPage from './pages/reports/ReportsPage'
import LandingPagesPage from './pages/landing-pages/LandingPagesPage'
import LandingPageEditor from './pages/landing-pages/LandingPageEditor'
import LandingPagePublicPage from './pages/landing-pages/LandingPagePublicPage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen">טוען...</div>
  if (!user)   return <Navigate to="/login" replace />
  return <LabelsProvider>{children}</LabelsProvider>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Public landing page — no auth required */}
      <Route path="/lp/:tenant/:slug" element={<LandingPagePublicPage />} />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"   element={<DashboardPage />} />
        <Route path="leads"       element={<LeadsPage />} />
        <Route path="pipeline"    element={<PipelinePage />} />
        <Route path="contacts"    element={<ContactsPage />} />
        <Route path="import"      element={<ImportPage />} />
        <Route path="reports"     element={<ReportsPage />} />
        <Route path="automations" element={<AutomationsPage />} />
        <Route path="forms"       element={<FormsPage />} />
        <Route path="settings"    element={<SettingsPage />} />
        <Route path="landing-pages"           element={<LandingPagesPage />} />
        <Route path="landing-pages/new"       element={<LandingPageEditor />} />
        <Route path="landing-pages/:id/edit"  element={<LandingPageEditor />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
