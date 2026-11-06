# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

This directory (`apps/frontend`) is the Next.js UI inside the Qurelio v2 monorepo. The repo root (`../..`) also contains:

- `apps/gateway`: NestJS API Gateway (port 3000), the single backend entry point for the frontend
- `apps/project`: secondary Next.js app
- `services/{auth,document,evaluation,notification}-service`. NestJS microservices behind the gateway
- `services/rag-service`: Python/FastAPI RAG service
- `docker/docker-compose.yml`: full-stack orchestration; root scripts `npm run docker:up` / `docker:down` / `docker:config` run from the repo root

## Frontend commands

```bash
npm run dev      # next dev on :3001 (NODE_OPTIONS=--max-old-space-size=4096, Turbopack)
npm run build    # next build (standalone output)
npm run start    # next start on :3001
```

No test runner or lint script is wired in `package.json`. ESLint config exists, invoke `npx next lint` manually if needed. Don't claim tests pass; there are none.

## Backend wiring (critical)

The browser never talks to microservices directly. `next.config.js` rewrites `/api/:path*` to `API_PROXY_TARGET` (defaults to `http://127.0.0.1:3000`, the gateway). In Docker, set `API_PROXY_TARGET=http://gateway:3000`.

- `src/lib/api.ts`: Axios client. Browser uses relative URLs (so the Next rewrite applies); SSR uses `INTERNAL_API_URL` / `NEXT_PUBLIC_API_URL`. Handles JWT refresh via a shared `refreshPromise` against `/api/auth/refresh`.
- `src/lib/auth-store.ts`: Zustand store holding access/refresh tokens and user. Source of truth for auth on the client.
- On Windows/Docker, the UI may only be reachable via `http://127.0.0.1:3001` (IPv6 `::1` vs IPv4 mismatch). Keep `FRONTEND_URL` aligned with the URL actually opened in the browser for CORS/cookies.

## RBAC / route access

`src/lib/route-access.ts` defines paths forbidden to `SUPER_ADMIN` users (they get redirected to `/admin/companies`). When adding new tenant top-level routes (documents, evaluations, audits, nc, rag-chat, company, docs, reports, activity-log), update `SUPER_ADMIN_FORBIDDEN_PREFIXES` so super admins don't accidentally land on tenant-only pages.

## Layout shell

`src/components/layout/`: `DashboardLayout`, `Sidebar`, `Topbar`, `SidebarGlobalSearch`. The Sidebar:

- Exports `SIDEBAR_WIDTH` (280) and `SIDEBAR_COLLAPSED_WIDTH` (80), consumers reading layout width must import these constants, not hardcode.
- Filters nav items by `roles` against `useAuthStore`.
- **Collapsed-state UX:** each `NavLink` renders as a vertical stack, icon on top, label visible underneath in small text. Do not hide labels behind tooltips when shrinking the rail. Section headers (`SectionLabel`) still collapse to zero height; the per-item rule applies to the tabs themselves.

## Icon system

Icons are HugeIcons. **Always import from `@/components/icons`** (the wrapper at `src/components/icons/index.tsx`), never from `@hugeicons/react`, `@hugeicons/core-free-icons`, or `lucide-react` directly. The wrapper re-exports icons under Lucide-compatible names (`LayoutDashboard`, `Building2`, `ChevronLeft`, …) so existing call sites keep working.

## Styling

- Tailwind v4 (`@tailwindcss/postcss`) with `tailwind.config.ts`. Use design tokens via CSS variables: `var(--brand-primary)`, `var(--brand-accent)`, `var(--nav-hover)`, `var(--nav-inactive)`, `var(--sidebar-bg)`, `var(--border)`, `var(--muted)`, etc., defined in `src/styles` / `globals.css`. Don't hardcode brand colors.
- Public Sans is the brand font (`@fontsource/public-sans`). For pasted landing-page code, strip any Google Fonts imports and route through Public Sans; use `--brand-accent` on eyebrow labels.
- MUI (`@mui/material`) is present for some legacy/admin surfaces, but new components prefer Radix UI primitives (`@radix-ui/*`) styled with Tailwind, plus `class-variance-authority` and `tailwind-merge` via `src/utils/cn.ts`.
- Forms: React Hook Form + Zod resolvers. Phone input: `react-phone-number-input` + `libphonenumber-js`.

## Landing-page conventions

- First interactive card is active by default and shows its info immediately.
- Card selection is **click-only**, not hover. No auto-cycling, no auto-unlock.

## Dashboard route-change UX

When the pathname or query changes inside the dashboard shell, show a 500 ms spinner overlay on the main content area (see `src/components/loading/`). Don't block the entire viewport.

## Path alias

`@/*` → `src/*` (see `tsconfig.json`). Use it for all internal imports.

## Things that look weird but aren't

- `.history/` at the repo root is a VS Code Local History dump, ignore it, don't edit those files.
- `tsc-out.log` at the root is a stale type-check dump.
- `apps/frontend/Dockerfile` builds the `standalone` Next output; don't switch `output` away from `standalone` without updating the Dockerfile and compose config.
