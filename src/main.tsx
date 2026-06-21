import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import App from './App';
import './styles/app.css';
import './styles/viewer.css';
import './styles/themes.css';

// We deliberately do NOT load Google's GIS script (@react-oauth/google's
// GoogleOAuthProvider). Web Google sign-in uses a plain OAuth *redirect* flow
// (see lib/googleRedirect.ts) and native uses the system picker — so there's no
// GIS widget/One Tap that could render a stray floating "G" anywhere.
const tree = (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </BrowserRouter>
);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>{tree}</React.StrictMode>
);
