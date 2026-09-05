import { useState, useEffect } from 'react';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { WatchlistPage } from './pages/WatchlistPage';
import { authService, getAccessToken, setAccessToken } from './services/authService';
import { useSessionStore } from './store/sessionStore';
import { captureExitSnapshot } from './utils/checkpoint';

type AuthView = 'login' | 'register' | 'app';

export default function App() {
  const [currentView, setCurrentView] = useState<AuthView>('login');
  const [isInitializing, setIsInitializing] = useState(true);

  const setUserId = useSessionStore((state) => state.setUserId);

  // Check if existing refresh token or valid session exists
  useEffect(() => {
    const checkSession = async () => {
      const refreshToken = localStorage.getItem('wl_refresh_token');
      if (refreshToken || getAccessToken()) {
        try {
          const userRes = await authService.getMe();
          setUserId(userRes.user.id);
          setCurrentView('app');
        } catch {
          localStorage.removeItem('wl_refresh_token');
          setAccessToken(null);
          setCurrentView('login');
        }
      } else {
        setCurrentView('login');
      }
      setIsInitializing(false);
    };

    checkSession();
  }, [setUserId]);

  const handleLogout = async () => {
    try {
      await captureExitSnapshot(false);
    } catch (err) {
      console.error('Failed to capture exit snapshot on logout:', err);
    }
    await authService.logout();
    setCurrentView('login');
  };

  if (isInitializing) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-secondary)',
          fontSize: '1rem',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📊</div>
          <div>Initializing Groww Trading Terminal...</div>
        </div>
      </div>
    );
  }

  if (currentView === 'login') {
    return (
      <LoginPage
        onSwitchToRegister={() => setCurrentView('register')}
        onLoginSuccess={() => setCurrentView('app')}
      />
    );
  }

  if (currentView === 'register') {
    return (
      <RegisterPage
        onSwitchToLogin={() => setCurrentView('login')}
        onRegisterSuccess={() => setCurrentView('app')}
      />
    );
  }

  return <WatchlistPage onLogout={handleLogout} />;
}
