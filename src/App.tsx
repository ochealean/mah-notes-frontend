import { Routes, Route } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { isNative } from './lib/nativeAuth';
import AuthScreen from './components/AuthScreen';
import MainApp from './components/MainApp';
import Viewer from './components/Viewer';
import ResetPassword from './components/ResetPassword';
import Loader from './components/Loader';

function Home() {
  const { user, ready, googlePending } = useAuth();
  // Native is offline-first: open STRAIGHT into the notepad — no loading screen,
  // no login gate. The session is validated in the background (AuthContext).
  if (isNative) return <MainApp />;
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
      <Route path="/reset-password" element={<ResetPassword />} />
    </Routes>
  );
}
