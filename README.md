# AnomalyIQ SaaS Frontend

Production-oriented React frontend for the AnomalyIQ SaaS platform. The application is a feature-based Vite SPA built with React 19, Redux Toolkit, Axios, React Router, Recharts, and CSS Modules.

The UI language is intentionally French. Do not translate labels, messages, or business wording to English unless the product language strategy changes.

## Project Status

This project is configured for pre-production checks:

- Clean dependency installation with `npm ci` or `npm install`.
- Production build via Vite.
- ESLint quality gate.
- Production dependency audit gate.
- Feature-based folder structure.
- CSS Modules for component-specific styles.
- No inline JSX styling in source files.
- Stateless JWT frontend session handling with `sessionStorage`.

## Technology Stack

| Area | Tooling |
|---|---|
| Runtime | React 19 |
| Build tool | Vite 8 |
| Routing | React Router 7 |
| State | Redux Toolkit + React Redux |
| API transport | Axios |
| Charts | Recharts |
| Icons | Lucide React |
| Styling | CSS Modules + global design tokens |
| Quality | ESLint + Prettier + npm audit |

## Requirements

- Node.js 20 LTS or newer.
- npm 10 or newer recommended.
- A reachable backend API matching the expected AnomalyIQ endpoints.

## Quick Start

Install dependencies:

```powershell
npm ci
```

Create a local environment file:

```powershell
Copy-Item .env.example .env.local
```

Start the development server:

```powershell
npm run dev
```

Build for production:

```powershell
npm run build
```

Preview the production build locally:

```powershell
npm run preview
```

Run the complete local quality gate:

```powershell
npm run ci:check
```

## Available Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Starts the Vite development server. |
| `npm run build` | Produces a production bundle in `dist/`. |
| `npm run build:dev` | Builds with Vite development mode. |
| `npm run preview` | Serves the generated `dist/` bundle locally. |
| `npm run lint` | Runs ESLint over the codebase. |
| `npm run format` | Formats the repository with Prettier. |
| `npm run format:check` | Checks formatting without writing files. |
| `npm run audit:prod` | Audits production dependencies only. |
| `npm run ci:check` | Runs lint, build, and production audit. |

## Environment Variables

Create `.env.local` from `.env.example`.

| Variable | Example | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8080/api` | Backend API base URL used by the Axios client. |

Do not commit `.env.local` or any environment file containing secrets.

## Architecture Overview

The codebase follows a feature-first structure. Business code lives near the domain that owns it. Shared code is reserved for reusable infrastructure, generic UI, and cross-feature coordination.

```txt
src/
  app/          Application bootstrap, providers, router, shell layout
  constants/    App-wide constants and static definitions
  contexts/     React providers for UI/session concerns
  features/     Business domains and route-level product areas
  shared/       Reusable UI, layout, API infrastructure, cross-feature model actions
  store/        Redux Toolkit store wiring
  styles/       Global tokens and base stylesheet
  utils/        Small generic helpers only
```

Application flow:

```txt
src/main.jsx
  -> src/app/App.jsx
  -> src/app/providers/AppProviders.jsx
  -> src/app/router/AppRouter.jsx
  -> src/app/layout/AppShell.jsx
  -> lazy feature routes
```

`AppShell` is the authenticated application frame. It owns the sidebar, topbar, command palette provider, protected routing, initial session data loading, and logout flow.

## Feature Directory Convention

Every feature follows this shape:

```txt
src/features/<feature>/
  api/          Feature-owned backend endpoint wrappers
  model/        Redux slices, selectors, actions, and domain model helpers
  components/   Components used only by that feature
  pages/        Route-level screens
  utils/        Pure helpers specific to that feature
```

Current feature domains:

```txt
alerts
anomalies
audit
budget
explorer
integrations
partners
pipelines
series
settings
```

Some feature folders contain `README.md` markers when a conventional subfolder exists for future ownership but does not yet need runtime code. This is intentional and avoids fake placeholder modules.

## Important Paths

| Path | Responsibility |
|---|---|
| `src/app/App.jsx` | Application root component. |
| `src/app/providers/AppProviders.jsx` | Global providers such as Redux and auth context. |
| `src/app/router/routes.jsx` | Route registry. |
| `src/app/router/RouteElements.jsx` | Lazy route component wiring. |
| `src/app/layout/AppShell.jsx` | Authenticated layout shell. |
| `src/shared/api/apiClient.js` | Axios client, auth header injection, refresh retry, tenant scoping. |
| `src/shared/api/authStorage.js` | JWT/user session storage and token expiry validation. |
| `src/store/reduxStore.js` | Redux store configuration. |
| `src/store/rootReducer.js` | Root reducer composition. |
| `src/styles/tokens.css` | Design tokens and CSS variables. |
| `src/styles/global.css` | Global reset, utilities, animations, and shared app classes. |

## API Layer

All HTTP transport goes through `src/shared/api/apiClient.js`.

Responsibilities:

- Attach JWT `Authorization` header.
- Attach engine-admin tenant context when available.
- Retry once through `/auth/refresh` when an authenticated request receives `401`.
- Normalize API error messages for callers.

Feature endpoint ownership belongs in `src/features/<feature>/api`. Pages and components should call feature API wrappers or feature model actions rather than importing `apiClient` directly unless they are implementing a feature API wrapper.

## State Management

Redux Toolkit is used for durable app state and server-backed cache state.

Current root slices:

```txt
alerts
partners
pipelines
```

Use component state for local UI state such as selected tabs, modal visibility, draft form values, and temporary filters.

## Routing And Loading

Routes are lazy-loaded to keep initial bundles smaller. Route rendering is wrapped with:

- `ErrorBoundary` for route-level crash isolation.
- `RouteLoadingFallback` for Suspense loading states.

Protected routes live under the authenticated shell. Workspace routes have their own route wrapper because they carry pipeline-specific transient state.

## Styling System

The styling strategy is:

- CSS variables and app-wide utilities in `src/styles/tokens.css` and `src/styles/global.css`.
- Component-specific styles in adjacent CSS Modules.
- No inline JSX styles in source files.
- No Tailwind runtime or Tailwind build dependency.

Rules for new UI code:

- Create `ComponentName.module.css` beside `ComponentName.jsx`.
- Import CSS Modules as `styles`.
- Keep global classes only for stable reusable primitives such as buttons, cards, tabs, badges, and animations.
- Use French UI text unless product requirements explicitly say otherwise.

## Authentication And Session

The backend is stateless and uses JWTs. The frontend stores JWT/user session data in `sessionStorage`.

Session behavior:

- JWT is read from `sessionStorage`.
- Malformed tokens are rejected.
- Expired tokens are rejected based on the JWT `exp` claim.
- Session data is cleared when invalid or expired.

The app intentionally does not use `httpOnly` cookies because the backend authentication model is stateless JWT.

## Browser Storage

`sessionStorage` is used for session-scoped data:

- JWT and current user profile.
- Active UI/session context.
- Pipeline workspace transient cache.

`localStorage` is used only for the documented ERP widgets mirror:

```txt
anomalyiq.erpConnectors
```

That key is read by the widgets app. Do not remove or rename it without changing the widget integration contract.

## Quality Gates

Before opening a pull request or deploying to pre-production, run:

```powershell
npm run ci:check
```

The command must pass all three gates:

- ESLint
- Vite production build
- Production dependency audit

Full dependency audit can be run with:

```powershell
npm audit
```

Current dependency policy:

- Prefer targeted package updates over blind `npm audit fix`.
- Keep production audit clean.
- Keep full audit clean when possible.
- Use `npm ci` in CI and deployment environments.

## CI

GitHub Actions workflow:

```txt
.github/workflows/ci.yml
```

It runs on pull requests and pushes to `main` or `develop`.

The CI job performs:

```txt
npm ci
npm run ci:check
```

## Manual Smoke Test

After `npm run dev` or `npm run preview`, verify:

- Login page renders.
- JWT login works against the configured backend.
- Dashboard opens after login.
- Sidebar/topbar navigation works.
- Integrations page opens.
- Pipeline workspace route opens.
- Refreshing a protected route keeps a valid session or clears an expired session.
- Browser console has no app-origin runtime errors.

Browser-extension warnings from `contentscript.js` are not app errors.

## Deployment Notes

The production artifact is `dist/`.

Typical static-host deployment flow:

```powershell
npm ci
npm run ci:check
```

Then deploy the generated `dist/` folder to the chosen static host or web server.

For SPA routing, the hosting layer must fallback unknown routes to `index.html`.

## Repository Hygiene

Do not commit:

- `node_modules/`
- `dist/`
- `.env.local`
- generated logs or cache folders

Commit these when changed intentionally:

- `package.json`
- `package-lock.json`
- source files under `src/`
- documentation files
- CI configuration

## Additional Documentation

- `ARCHITECTURE.md`: detailed architecture rules and boundaries.
- `PREPROD_CHECKLIST.md`: operational checklist before pre-production promotion.
