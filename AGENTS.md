# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Classworks (作业板) is a homework board widget for classroom large screens. It's a Vue 3 + Vuetify 3 PWA with real-time sync via Socket.IO. The UI is in Chinese.

## Commands

```bash
pnpm install          # Install dependencies
pnpm run dev          # Dev server at localhost:3031 (network-accessible)
pnpm run build        # Production build (auto-runs prebuild to regenerate sound list)
pnpm run preview      # Preview production build
pnpm run lint         # ESLint with auto-fix
```

## Tech Stack

- **Framework**: Vue 3 (Composition API + Options API mixed), JavaScript (no TypeScript)
- **UI**: Vuetify 3 (Material Design 3), `@mdi/font` icons, SCSS
- **State**: Pinia 3
- **Routing**: Vue Router 4 with file-based routes (`unplugin-vue-router` + `vite-plugin-vue-layouts`)
- **Build**: Vite 5, pnpm
- **Real-time**: Socket.IO client (singleton in `src/utils/socketClient.js`)
- **Data**: NPClassworks v2 HTTP API (`src/utils/classworksV2Client.js`) plus scoped local caches for offline large-screen operation
- **PWA**: `vite-plugin-pwa` with Workbox service worker

## Architecture

### Data Layer

`src/utils/classworksV2Client.js` is the frontend API boundary for setup, accounts, academic structure, publications, classroom screens and administration. Offline large-screen state is isolated in `src/utils/screenOfflineCache.js` and `src/utils/screenPublicationQueue.js`.

### Real-time Layer

`src/utils/socketClient.js` — Socket.IO singleton with workspace-room join/leave for publication invalidation events.

### Settings Layer

`src/utils/settings.js` — Comprehensive localStorage-based settings with typed definitions, defaults, and legacy migration. ~600 lines.

### UI Layer

File-based routing: each `.vue` in `src/pages/` becomes a route. Layouts are in `src/layouts/`. The root page mounts `src/components/v2/ClassworksHome.vue`, which switches between student, teacher and classroom-screen experiences.

Components are organized by feature:
- `src/components/v2/` — Main homework board, authentication, screen tools and current settings UI
- `src/components/admin/` — School administration views
- `src/components/common/` — Shared components

### Key Utilities

- `src/utils/classworksV2Client.js` — Axios clients, account/session handling and v2 API methods
- `src/utils/visitorId.js` — Locally generated stable device identifier; browser fingerprint analytics are opt-in at build time
- `src/utils/soundList.js` — Auto-generated from `public/sounds/` by `scripts/generate-sound-list.js` (runs as `prebuild`)

## Code Style

- 2-space indent, trim trailing whitespace (`.editorconfig`)
- Path alias: `@/` maps to `src/` (`jsconfig.json`)
- ESLint flat config (ESLint 9) with Vue recommended rules (`eslint.config.js`)
- Mixed Composition API and Options API usage
- No TypeScript
