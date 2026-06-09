import { Routes, Route } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import MainApp from './components/MainApp.jsx';
import Viewer from './components/Viewer.jsx';
import Loader from './components/Loader.jsx';

function Home() {
  const { user, ready } = useAuth();
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
