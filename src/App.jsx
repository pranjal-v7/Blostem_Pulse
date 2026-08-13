import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './components/Toast'
import AppShell from './components/AppShell'
import LoginPage from './pages/LoginPage'
import OnboardingPage from './pages/OnboardingPage'
import RadarPage from './pages/RadarPage'
import CompanyDetailPage from './pages/CompanyDetailPage'
import OutreachPage from './pages/OutreachPage'
import SettingsPage from './pages/SettingsPage'
import HistoryPage from './pages/HistoryPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import NotFoundPage from './pages/NotFoundPage'
import { Loader2 } from 'lucide-react'
import { supabase } from './lib/supabase'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--teal)' }} />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  const { user, loading } = useAuth()

  // Seed 3 demo "freshly discovered" companies — idempotent: queries first, only inserts what's missing
  useEffect(() => {
    async function injectNewCompanies() {
      if (!user) return;

      const SEED_COMPANIES = [
        { name: 'Groww', sector: 'Wealthtech', stage: 'Late Stage', hq_city: 'Bengaluru', is_new_entrant: true, intent_score: 89 },
        { name: 'Zerodha', sector: 'Wealthtech', stage: 'Bootstrapped', hq_city: 'Bengaluru', is_new_entrant: true, intent_score: 84 },
        { name: 'Navi', sector: 'Lending', stage: 'Late Stage', hq_city: 'Bengaluru', is_new_entrant: true, intent_score: 79 },
      ];

      const seedNames = SEED_COMPANIES.map(c => c.name);

      try {
        // Step 1: Check which names already exist in the DB
        const { data: existing } = await supabase
          .from('prospects')
          .select('name')
          .in('name', seedNames);

        const existingNames = new Set((existing || []).map(r => r.name));

        // Step 2: Only insert companies that are NOT already present
        const toInsert = SEED_COMPANIES.filter(c => !existingNames.has(c.name));
        if (toInsert.length > 0) {
          await supabase.from('prospects').insert(toInsert);
          console.log(`Seeded ${toInsert.length} new demo company/companies.`);
        }
      } catch (err) {
        console.error('Demo seed failed:', err);
      }
    }
    injectNewCompanies();
  }, [user]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--teal)' }} />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/app/radar" replace /> : <LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/app" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="radar" element={<RadarPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="company/:id" element={<CompanyDetailPage />} />
        <Route path="outreach" element={<OutreachPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route index element={<Navigate to="radar" replace />} />
      </Route>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
