# Pre-Production Checklist

Use this before merging to a staging or pre-production branch.

## Required Local Checks

```powershell
npm ci
npm run ci:check
```

Expected result:

- ESLint passes.
- Vite production build passes.
- `npm audit --omit=dev` reports `0 vulnerabilities`.

## Manual Smoke Test

Run:

```powershell
npm run dev
```

Then verify in the browser:

- Login screen loads.
- JWT login flow works against the configured backend.
- Main dashboard route loads after login.
- Navigation sidebar/topbar routes load without blank screens.
- ERP integrations page opens.
- Pipeline workspace route opens.
- Refreshing a protected route keeps or correctly clears the session.

## Environment

Required variable:

- `VITE_API_BASE_URL`: backend API base URL.

Create `.env.local` from `.env.example` for local development. Do not commit `.env.local`.

## Dependency Policy

- Use `npm ci` in CI and deployment.
- Do not run `npm audit fix` blindly.
- For vulnerabilities, prefer targeted package updates and rerun `npm run ci:check`.

## Current Security Notes

- The app uses stateless JWT auth stored in browser `sessionStorage`.
- JWT payload expiry (`exp`) is checked client-side and clears stale sessions.
- `localStorage` is only used for the documented ERP widgets mirror: `anomalyiq.erpConnectors`.
