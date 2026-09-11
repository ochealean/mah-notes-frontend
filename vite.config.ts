import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import downloadHandler from './api/download.js';

// ── Content Security Policy ─────────────────────────────
//
// Built here rather than hardcoded in index.html because it has to name the API
// origin, which differs between dev, the web deploy and the packaged apps. A
// policy that is wrong for one target gets switched off for all of them, so it
// is derived from the same env var the app actually calls.
//
// This meta tag is what protects the ANDROID WebView and the desktop webview,
// neither of which has a server to send a header. The web deploy gets the same
// policy as a real header from vercel.json — headers win where both exist, and
// frame-ancestors only works as a header, which is why both are set.
function cspFor(apiBase: string) {
  const api = apiBase.replace(/\/$/, '');
  // socket.io upgrades to a WebSocket on the same origin as the API.
  const ws = api.replace(/^http/, 'ws');

  return [
    "default-src 'self'",
    // No 'unsafe-inline' and no 'unsafe-eval'. This is the directive that
    // actually stops an injected <script>, and the one worth protecting: the
    // theme bootstrap lives in public/theme-boot.js precisely so this can hold.
    "script-src 'self'",
    // 'unsafe-inline' is unavoidable here — the app styles elements with React
    // `style` props throughout, and those are inline styles. It is a far
    // smaller concern than inline script: CSS cannot exfiltrate a token.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    // Avatars come from Google and from wherever a user's profile picture is
    // hosted, and notes can embed images. data: and blob: cover pasted images.
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${api} ${ws} https://api.github.com https://accounts.google.com https://www.googleapis.com`,
    // Google's sign-in flow is a full-page redirect, not a frame, so nothing
    // needs framing and nothing may frame us.
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

function cspPlugin(apiBase: string) {
  return {
    name: 'inject-csp',
    // Builds only. Vite's dev server injects its own inline scripts for hot
    // reload, so a policy this strict would break `npm run dev` and the first
    // instinct would be to loosen the policy rather than scope it.
    apply: 'build' as const,
    transformIndexHtml(html: string) {
      // The desktop build gets its policy from tauri.conf.json instead, as a
      // real header. Emitting this one as well would mean BOTH have to allow
      // every request — and the Tauri build needs ipc: and asset: sources that
      // make no sense anywhere else. The result would be a webview where
      // invoke() silently fails, which is a miserable thing to debug.
      if (isDesktop) return html.replace('<!--CSP-->', '');
      return html
        .replace(
          '<!--CSP-->',
          `<meta http-equiv="Content-Security-Policy" content="${cspFor(apiBase)}">`
        )
        // Root-absolute for the web and Android, where the page is served from
        // a real root and a route like /view would otherwise resolve "./"
        // against the wrong directory. The desktop build keeps it relative
        // because it loads from a custom protocol with no server behind it.
        .replace('src="./theme-boot.js"', 'src="/theme-boot.js"');
    },
  };
}

// `vercel dev` isn't in the loop for `npm run dev`, so /api/download would 404
// locally and the Download button couldn't be tested on a real phone. Mount the
// very same handler as dev middleware — one implementation, so what you test
// over the LAN is what ships.
function apiRoutes() {
  return {
    name: 'api-routes-dev',
    configureServer(server) {
      server.middlewares.use('/api/download', (req, res) => downloadHandler(req, res));
    },
  };
}

// Vite dev server on :5173 (must match backend CLIENT_ORIGIN).
// The desktop bundle is loaded from a custom protocol rather than a web root,
// so its asset URLs must be relative. The web deploy keeps absolute paths.
const isDesktop = process.env.VITE_APP_TARGET === 'desktop';

export default defineConfig(({ mode }) => {
  // loadEnv rather than import.meta.env: this runs in Node at config time,
  // before any of the app's own env handling exists.
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiBase = env.VITE_API_BASE || 'http://localhost:3000';

  return {
    base: isDesktop ? './' : '/',
    plugins: [react(), apiRoutes(), cspPlugin(apiBase)],
    server: { port: 5173 },
  };
});
