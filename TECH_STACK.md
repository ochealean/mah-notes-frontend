# Mah Notes — Project Overview & Tech Stack

## About the project

**Mah Notes** is a full-stack productivity app for capturing **rich-text documents**,
**weekly plans**, and **checklists** in one place — and sharing any of them with a
public link. It is built on the **MERN stack** in a **poly-repo** architecture
(independently deployable frontend and backend).

Beyond basic CRUD, it offers a formatting toolbar with inline checklists, **recurring
auto-reset** (documents can clear their checkboxes daily / weekly / monthly and plans
reset every day), a **privacy mode** that blurs sensitive content, and a **sharing
system** with two link types: a real-time **live** view and a **reference** scratch
copy whose ticks are saved only on the viewer's own device. Authentication supports
both **email/password** (hashed with bcrypt, sessions via JWT) and **Google Sign-In**
(verified server-side). The UI ships with a **light/dark/system theme** and a
mobile-first, responsive design.

All data is persisted to **MongoDB Atlas**, the API runs on **Render**, and the React
client is hosted on **Vercel**.

> **In one line:** A MERN notes-and-planner app with rich-text editing, recurring
> checklists, privacy mode, and public live/reference sharing — JWT + Google auth,
> deployed across Vercel, Render, and MongoDB Atlas.

---

## Architecture

- **Pattern:** MERN (MongoDB · Express · React · Node.js)
- **Repo style:** Poly-repo — `frontend` and `backend` are separate codebases and deployments
- **Data model:** A single MongoDB database (`mahnotesDB`) and a single collection
  (`data`), with document types separated by Mongoose **discriminators**
  (`User`, `Note`, `Plan`, `ShareToken`)

---

## Frontend

| Technology | Version | Role |
|---|---|---|
| React | 18.3 | UI library |
| React DOM | 18.3 | Browser rendering |
| React Router DOM | 6.26 | Client-side routing (`/` app, `/view` viewer) |
| Vite | 5.4 | Dev server + production bundler |
| @vitejs/plugin-react | 4.3 | React/JSX support for Vite |
| @react-oauth/google | 0.12 | Google Sign-In (ID-token flow) |
| Plain CSS | — | `app.css`, `viewer.css`, `themes.css` (CSS-variable theming + dark mode) |
| Font Awesome | 6.4 (CDN) | Icons |
| Browser APIs | — | `fetch`, `localStorage`, `contentEditable`, `matchMedia` |

State is handled with React Context (`AuthContext`, `ThemeContext`) and a small
hand-rolled `fetch` wrapper — no external state library or HTTP client.

## Backend

| Technology | Version | Role |
|---|---|---|
| Node.js | 22.x | Runtime (ES Modules) |
| Express | 4.19 | HTTP API framework |
| MongoDB | — | Database |
| Mongoose | 8.6 | ODM; schemas via discriminators |
| jsonwebtoken | 9.0 | Issues/verifies JWT auth tokens |
| bcryptjs | 2.4 | Password hashing |
| google-auth-library | 9.14 | Verifies Google ID tokens server-side |
| sanitize-html | 2.13 | Sanitizes note HTML (XSS boundary for shared content) |
| cheerio | 1.0 | Server-side DOM for checklist auto-reset |
| cors | 2.8 | Cross-origin access (Vercel ↔ Render) |
| dotenv | 16.4 | Environment configuration |

## Infrastructure & services

| Service | Role |
|---|---|
| MongoDB Atlas | Managed MongoDB cluster |
| Render | Hosts the Express API |
| Vercel | Hosts the React client |
| Google Cloud (OAuth 2.0) | Google Sign-In credentials |
| Git | Version control (per repo) |

---

## Authentication flow

```
React (@react-oauth/google)
   → Google ID token
      → POST /api/auth/google
         → google-auth-library verifies the token
            → Mongoose finds/creates the User
               → jsonwebtoken issues a JWT
                  → stored in localStorage
                     → sent as "Authorization: Bearer <jwt>" on every request
```

Email/password follows the same tail end: bcrypt verifies the hash, then a JWT is issued.
