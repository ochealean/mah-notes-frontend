import { Routes, Route } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { hasLocalStore } from './lib/platform';
import AuthScreen from './components/AuthScreen';
import MainApp from './components/MainApp';
import Viewer from './components/Viewer';
import ResetPassword from './components/ResetPassword';
import DownloadPage from './components/DownloadPage';
import Toast from './components/Toast';
import ClipPanel from './components/ClipPanel';
import Loader from './components/Loader';

function Home() {
  const { user, ready, googlePending } = useAuth();
  // Native is offline-first: open STRAIGHT into the notepad — no loading screen,
  // no login gate. The session is validated in the background (AuthContext).
  if (hasLocalStore) return <MainApp />;
  // Web keeps the login-first flow (still needs the token check first).
  if (!ready) return <Loader text="Loading…" />;
  // Just back from Google and still exchanging the code for a session: show the
  // spinner, NOT the login form — otherwise the sign-in looks like it failed and
  // the user clicks Google again, killing the in-flight exchange.
  // ('link' stays out of this: that user is already signed in — see ConnectGoogle.)
  if (googlePending === 'login') return <Loader text="Signing you in…" />;
  return user ? <MainApp /> : <AuthScreen />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/view" element={<Viewer />} />
      <Route path="/download" element={<DownloadPage />} />
      {/* Desktop only, each in its own borderless window: the Alt+N toast
          and the Alt+M paste panel. */}
      <Route path="/toast" element={<Toast />} />
      <Route path="/clip-panel" element={<ClipPanel />} />
      <Route path="/reset-password" element={<ResetPassword />} />
    </Routes>
  );
}
