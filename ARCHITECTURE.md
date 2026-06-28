# Architecture

This frontend uses a feature-based structure. Code should live near the domain that owns it, with shared code limited to reusable building blocks.

## Top-Level Folders

```txt
src/app       Application bootstrap, providers, routing, authenticated shell
src/features  Business domains: auth, tenants, pipelines, alerts, budget, etc.
src/shared    Reusable UI, layout, API infrastructure, and cross-feature model actions
src/store     Redux Toolkit store wiring
src/contexts  React providers for UI/session concerns that are not pure Redux slices
src/services  Larger transitional service modules that do not yet fit one feature cleanly
src/utils     Small generic helpers
src/constants App-wide constants and static definitions
src/styles    Global style tokens and base styles
```

## Feature Shape

```txt
features/<feature>/api         Backend calls owned by the feature
features/<feature>/model       Redux slices, selectors, and feature actions
features/<feature>/pages       Route-level screens
features/<feature>/components  Components used only by that feature
features/<feature>/utils       Pure helpers specific to that feature
```

`model` means feature state and domain logic. Slices mutate Redux state, selectors read/derive Redux state, and action files coordinate API calls plus cache updates.

## App Flow

```txt
main.jsx
  -> app/App.jsx
  -> app/providers/AppProviders.jsx
  -> app/router/AppRouter.jsx
  -> app/layout/AppShell.jsx
  -> lazy feature routes
```

`AppShell` is the authenticated frame. It owns the sidebar, topbar, command palette provider, authenticated page routing, initial tenant data loading, and logout flow.

## State

Redux root slices:

```txt
alerts
audit
auth
documents
partners
pipelines
tenants
```

Use Redux for durable app state and server cache state. Use component state for local form values, selected tabs, modal state, and temporary filters.

## API Boundaries

`src/shared/api/apiClient.js` owns Axios, auth headers, refresh retry, and engine-admin tenant headers.

Feature endpoint functions belong in `features/<feature>/api`. Pages and components should prefer feature API functions or feature actions over direct `apiGet/apiPost` calls.

`src/utils/api.js` remains a compatibility wrapper around the shared Axios client for older call sites. New endpoint-specific code should not be added there.

## Shared Code Rules

`shared/ui` should contain generic UI with no business domain knowledge.

`shared/layout` contains app layout components reused by the shell.

`shared/model` is only for cross-feature actions/loaders that intentionally coordinate multiple slices.

Do not place feature-specific components in `shared` just because they are visually reusable. Keep them in their owning feature until at least two unrelated features need them.

## Naming

Component files use descriptive PascalCase names. Generic names like `components.jsx`, `assistant.jsx`, or `helpers.js` should be avoided unless they are genuinely scoped and clear from the folder.

## Generated Files

`dist` and graph/build outputs are generated and should not be kept in the source tree after verification.
