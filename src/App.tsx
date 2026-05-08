import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import Layout from './components/Layout'
import AdminLayout from './components/AdminLayout'
import AgentPage from './pages/AgentPage'
import ApiKeysPage from './pages/ApiKeysPage'
import CliPage from './pages/CliPage'
import HistoryPage from './pages/HistoryPage'
import AdminLoginPage from './pages/AdminLoginPage'
import AdminDashboardPage from './pages/AdminDashboardPage'
import AdminUsersPage from './pages/AdminUsersPage'
import AdminUserDetailPage from './pages/AdminUserDetailPage'
import AdminAnalysisDetailPage from './pages/AdminAnalysisDetailPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/users/:id" element={<AdminUserDetailPage />} />
            <Route path="/admin/analyses/:id" element={<AdminAnalysisDetailPage />} />
          </Route>
          <Route element={<Layout />}>
            <Route path="/" element={<AgentPage />} />
            <Route path="/analysis/:id" element={<AgentPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/cli" element={<CliPage />} />
            <Route path="/api-keys" element={<ApiKeysPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
