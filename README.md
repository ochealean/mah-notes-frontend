# Mah Notes — Frontend (MERN)

React + Vite single-page app for **Mah Notes**. Talks to the Express/MongoDB
backend over REST. Ported from the original Firebase web/PWA app, keeping the
same "Calm Lavender" look and feature set:

- Email/password **and** Google sign-in
- **Documents** — rich-text editor with inline checklists + recurring auto-reset
- **Weekly plans** — day-by-day checklists that reset daily
- **Privacy** — blur/hide items
- **Sharing** — public **live** links and **reference** (scratch-copy) links

## Stack
React 18 · React Router · Vite · `@react-oauth/google`

## Run it
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
```
> Start the **backend** first (default `http://localhost:3000`) — its URL is set
> by `VITE_API_BASE`.

## Environment (`.env`)
| Key                     | Required | What it is |
|-------------------------|----------|------------|
| `VITE_API_BASE`         | yes | Backend base URL, e.g. `http://localhost:3000`. |
| `VITE_GOOGLE_CLIENT_ID` | only for Google login | OAuth **Client ID** (`…apps.googleusercontent.com`). |

> ⚠️ A Google **client secret** must **never** be in the frontend (it ships to the
> browser). Only the *Client ID* belongs here. The backend doesn't need the secret
> either for this sign-in flow — it only verifies the Google ID token.

## How it maps to the backend
| Screen / action        | Endpoint(s) |
|------------------------|-------------|
| Sign in / up / Google  | `/api/auth/*` |
| Docs tab               | `GET/POST/PUT/DELETE /api/notes` |
| Plans tab              | `GET/POST/PUT/DELETE /api/plans`, `PATCH /api/plans/:id/check` |
| Hide (privacy)         | `PUT /api/notes|plans/:id { hidden }` |
| Share sheet            | `POST /api/share`, `…/regen`, `DELETE /api/share/:token` |
| `/view?token=…`        | `GET /api/share/:token` (public; live mode polls every 4s) |
| `/view?type=&id=…`     | owner view (`GET /api/notes|plans/:id`, saves on tick) |

## Project layout
```
src/
  main.jsx            # providers (Google, Router, Auth) + styles
  App.jsx             # routes: "/" app, "/view" viewer
  context/AuthContext.jsx
  lib/                # api client, richtext sanitizer, notify
  components/         # AuthScreen, MainApp, Docs/Plans/Settings tabs,
                      # DocEditor, PlanEditor, ShareModal, Viewer
  styles/             # app.css (ported), viewer.css
```
