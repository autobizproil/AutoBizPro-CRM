import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/auth/LoginPage'
import Layout from './components/ui/Layout'
import DashboardPage from './pages/dashboard/DashboardPage'
import LeadsPage from './pages/leads/LeadsPage'
import PipelinePage from './pages/pipeline/PipelinePage'
import ContactsPage from './pages/contacts/ContactsPage'
import AutomationsPage from './pages/automations/AutomationsPage'
import FormsPage from './pages/forms/FormsPage'
import SettingsPage from './pages/settings/SettingsPage'
import CustomersPage from './pages/customers/CustomersPage'
import ReportsPage from './pages/reports/ReportsPage'
import LandingPage from './pages/landing/LandingPage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen">טוען...</div>
  if (!user)   return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
        <Route path="customers"   element={<CustomersPage />} />
        <Route path="automations" element={<AutomationsPage />} />
        <Route path="forms"       element={<FormsPage />} />
        <Route path="landing"     element={<LandingPage />} />
        <Route path="reports"     element={<ReportsPage />} />
        <Route path="settings"    element={<SettingsPage />} />
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
