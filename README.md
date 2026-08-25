# Timo

Timo is a mobile-first productivity and time-management app — the blue,
time-management sibling to Auron's purple health & fitness product.

> Tell Timo what you need to do. Timo helps figure out when you should do it.

This repository currently contains the **UI foundation** stage only:
mobile-first app shell, design system, and static/mock-data screens for
Today, Tasks, Calendar, and Focus. No backend, auth, or AI features are
wired up yet — see `PENDING` below.

## Tech stack

- React + TypeScript
- Vite
- React Router (hash-based routing)
- Supabase (planned — not yet integrated)

## Getting started

```bash
npm install
npm run dev
```

Open the printed local URL. The app is mobile-first — use your browser's
device toolbar (or a real phone on the same network) for the intended
experience. Desktop renders a centered, polished max-width layout.

## Build

```bash
npm run build
```

Type-checks with `tsc -b` and produces a production build in `dist/`.

## Project structure

```
src/
  components/
    avatar/    Timo's placeholder character (state-ready, art not final)
    layout/    App shell, header, bottom navigation
    ui/        Reusable primitives (Button, Card, Badge, etc.)
  data/        Centralized mock/demo data (to be replaced by Supabase)
  features/
    today/     Today screen
    tasks/     Tasks list + Add Task sheet
    calendar/  Calendar screen (month/week/day)
    focus/     Focus timer screen
  i18n/        English (active) + French (dictionary ready, not switchable yet)
  lib/         Shared utilities
  styles/      Design tokens + global styles
  types/       Shared TypeScript types
```

## Pending

- Supabase (auth, tasks, calendar, focus sessions) not yet connected
- Add Task sheet is UI-only (does not persist)
- Calendar Week/Day views are placeholders
- Focus timer is static (no running clock yet)
- Locale switcher not built (English-only for now)
- AI features (Brain Dump, Plan My Day, replanning, insights) not started
