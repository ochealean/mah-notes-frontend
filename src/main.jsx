import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Capacitor } from '@capacitor/core';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import App from './App.jsx';
import './styles/app.css';
import './styles/viewer.css';
import './styles/themes.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const tree = (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </BrowserRouter>
);

// On the web, wrap with Google's provider (loads the GIS script for <GoogleLogin>).
// On a device we use native Google sign-in, so we skip the web SDK entirely —
// that avoids loading Google's script and any floating One Tap prompt it shows.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {Capacitor.isNativePlatform()
      ? tree
      : <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{tree}</GoogleOAuthProvider>}
  </React.StrictMode>
);
