import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { isDesktop } from './lib/platform';
import { installExternalLinkHandler } from './lib/externalLinks';
import { installBundleRuntime } from './lib/bundles';
import { installStarCollapse } from './lib/starCollapse';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import App from './App';
// Icons and the typeface, bundled rather than fetched from a CDN.
//
// They used to come from jsDelivr and Google Fonts with no integrity check, and
// they shipped that way inside the APK and the desktop binary too — so both
// packaged apps phoned out to a third party on every launch and rendered
// whatever came back. Self-hosting removes that trust, lets the Content
// Security Policy stay tight, and means the desktop app is genuinely offline.
import '@fortawesome/fontawesome-free/css/all.min.css';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/600.css';
import '@fontsource/archivo/800.css';
import './styles/app.css';
import './styles/viewer.css';
import './styles/themes.css';
// Cosmetic bundles. Last, so a bundle's accent layer sits on top of the
// theme it decorates rather than under it.
import './styles/bundles.css';

// We deliberately do NOT load Google's GIS script (@react-oauth/google's
// GoogleOAuthProvider). Web Google sign-in uses a plain OAuth *redirect* flow
// (see lib/googleRedirect.ts) and native uses the system picker — so there's no
// GIS widget/One Tap that could render a stray floating "G" anywhere.
// Desktop serves from a custom protocol with no server to rewrite unknown
// paths, so a cold start or reload on a deep path would 404. Hash routing has
// no such dependency. The web keeps BrowserRouter because /view share links
// are real URLs people paste around.
const Router = isDesktop ? HashRouter : BrowserRouter;

// Links inside notes carry target="_blank", which the packaged apps have no
// way to honour on their own — the click lands on nothing. Installed once,
// before render, so a link works on the very first painted note.
installExternalLinkHandler();

// Cosmetic bundles, both installed before render:
//  · the runtime pauses every bundle animation on a hidden tab or a blurred
//    window, marks Android for the reduced sky, and follows the system's
//    reduced-motion setting;
//  · the star-collapse click effect is one delegated listener, so buttons
//    rendered later are covered without any component knowing about it.
installBundleRuntime();
installStarCollapse();

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
