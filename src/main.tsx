import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { isDesktop } from './lib/platform';
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
// Desktop serves from a custom protocol with no server to rewrite unknown
// paths, so a cold start or reload on a deep path would 404. Hash routing has
// no such dependency. The web keeps BrowserRouter because /view share links
// are real URLs people paste around.
const Router = isDesktop ? HashRouter : BrowserRouter;

const tree = (
  <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </Router>
);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>{tree}</React.StrictMode>
);
