import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import Layout from './components/Layout'
import AgentPage from './pages/AgentPage'
import ApiKeysPage from './pages/ApiKeysPage'
import CliPage from './pages/CliPage'
import HistoryPage from './pages/HistoryPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
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
