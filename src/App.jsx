import { Routes, Route } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { isNative } from './lib/nativeAuth.js';
import AuthScreen from './components/AuthScreen.jsx';
import MainApp from './components/MainApp.jsx';
import Viewer from './components/Viewer.jsx';
import Loader from './components/Loader.jsx';

function Home() {
  const { user, ready } = useAuth();
  // Native is offline-first: open STRAIGHT into the notepad — no loading screen,
  // no login gate. The session is validated in the background (AuthContext).
  if (isNative) return <MainApp />;
  // Web keeps the login-first flow (still needs the token check first).
  if (!ready) return <Loader text="Loading…" />;
  return user ? <MainApp /> : <AuthScreen />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/view" element={<Viewer />} />
    </Routes>
  );
}
