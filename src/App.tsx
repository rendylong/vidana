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

function AdminPlaceholder({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <p className="text-sm font-medium text-zinc-900">{title}</p>
      <p className="mt-2 text-sm text-zinc-500">后续任务会接入完整数据和操作能力。</p>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/users" element={<AdminPlaceholder title="用户管理即将启用" />} />
            <Route path="/admin/analyses/:id" element={<AdminPlaceholder title="分析详情即将启用" />} />
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
