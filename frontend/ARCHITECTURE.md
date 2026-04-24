# Frontend architecture (Next.js App Router)

## 1. Routing map

| URL | Segment | Layout | Purpose |
|-----|---------|--------|---------|
| `/` | `app/page.tsx` | Root (`html` + `Providers` only) | Landing / entry |
| `/login` | `(auth)/login` | `(auth)/layout` | Auth — no platform chrome |
| `/register` | `(auth)/register` | `(auth)/layout` | Registration |
| `/dashboard/admin` | `(platform)/dashboard/admin` | Platform shell | Admin KPIs |
| `/dashboard/manager` | `(platform)/dashboard/manager` | Platform shell | Manager KPIs |
| `/dashboard/marketer` | `(platform)/dashboard/marketer` | Platform shell | Marketer KPIs |
| `/dashboard/executive` | `(platform)/dashboard/executive` | Platform shell | Executive KPIs |
| `/notebooks` | `(platform)/notebooks` | Platform shell | Notebook list |
| `/notebooks/[id]` | `(platform)/notebooks/[id]` | Platform shell | Single notebook |
| `/reports` | `(platform)/reports` | Platform shell | Saved reports |
| `/history` | `(platform)/history` | Platform shell | Query history |
| `/templates` | `(platform)/templates` | Platform shell | NL templates |
| `/dictionary` | `(platform)/dictionary` | Platform shell | Business dictionary |
| `/data-upload` | `(platform)/data-upload` | Platform shell | CSV / DS upload |
| `/settings` | `(platform)/settings` | Platform shell | User / workspace settings |

Route groups `(auth)` and `(platform)` do **not** appear in the URL.

## 2. Layout hierarchy

```
app/layout.tsx
├── <html>
├── <body>
├── <Providers>          ← React Query + SessionProvider
└── {children}

app/(auth)/layout.tsx
└── Centered column, no sidebar (login / register)

app/(platform)/layout.tsx
└── <PlatformShell>      ← header + role-aware sidebar + main
    └── {children}
```

## 3. Platform shell structure

- **Header**: product title, environment badge, optional user menu; link to “My dashboard” using `session.role`.
- **Sidebar**: primary navigation from `lib/navigation/config.ts`, filtered by `canSeeNavItem(role, item)`.
- **Main**: page content (`children`), max-width grid aligned with shell.

## 4. Role-aware navigation

- `SessionContext` holds `role: UserRole` (demo default `manager`; later JWT / `/auth/me`).
- Each `NavItem` may define `roles?: UserRole[]`. Omitted = visible to all authenticated roles.
- Dashboard entries: dynamic `href` `/dashboard/${role}` plus explicit admin/manager/... links where needed for demos.

## 5. Notebook page structure

- **List** (`/notebooks`): React Query → `GET /api/v1/notebooks`.
- **Detail** (`/notebooks/[id]`):
  - **Header**: title, workspace hint, actions (export / link CSV — placeholders).
  - **Composer**: prompt textarea + run (calls run cell API when wired).
  - **Cell stream**: ordered list of `NotebookCellView` by type (prompt, sql, table, …).
- Optional split: `components/notebook/notebook-page-layout.tsx` wraps header + composer + list for consistent spacing.

## 6. State management

- **Server state**: **TanStack React Query** — notebooks, reports, uploads; keys like `["notebooks"]`, `["notebook", id]`.
- **Auth / UI session**: **React Context** (`SessionProvider`) — `role`, `token` (localStorage when auth is implemented).
- **Notebook UI**: local `useState` for optimistic cells until server returns full trace; can migrate cell list to Query + mutation later.
- **URL state**: `useSearchParams` for filters (history, reports) when needed.

## 7. Reusable components

| Layer | Location | Examples |
|-------|----------|----------|
| Layout | `components/platform/`, `components/layout/` | `PlatformShell`, `PageHeader` |
| Notebook | `components/notebook/` | `NotebookCellView`, `NotebookPageLayout` |
| Domain | `components/dashboard/` | `RoleDashboard` |
| UI primitives | `components/ui/` | `Button`, `Card` (thin wrappers over Tailwind) |

Compose pages from layout + domain; avoid one-off giant pages.

## 8. API integration

- **Base URL**: `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).
- **Client**: `lib/api/client.ts` — `apiFetch(path, init)` prepends base, attaches `Authorization` when token exists.
- **Endpoints**: split by domain under `lib/api/` (`notebooks.ts`, `analytics.ts`, …) and re-export from `lib/api/index.ts`.
- **Versioning**: paths use `/api/v1/...` to match FastAPI backend.
- **Errors**: throw `ApiError` or return Result type; React Query `onError` for toasts later.

## 9. Folder structure (scaffold)

```
frontend/
├── ARCHITECTURE.md
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── providers.tsx
│   ├── globals.css
│   ├── (auth)/
│   │   ├── layout.tsx
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   └── (platform)/
│       ├── layout.tsx
│       ├── dashboard/
│       │   ├── admin/page.tsx
│       │   ├── manager/page.tsx
│       │   ├── marketer/page.tsx
│       │   └── executive/page.tsx
│       ├── notebooks/
│       │   ├── page.tsx
│       │   └── [id]/page.tsx
│       ├── reports/page.tsx
│       ├── history/page.tsx
│       ├── templates/page.tsx
│       ├── dictionary/page.tsx
│       ├── data-upload/page.tsx
│       └── settings/page.tsx
├── components/
│   ├── layout/
│   ├── platform/
│   ├── notebook/
│   ├── dashboard/
│   └── ui/
├── lib/
│   ├── api/
│   │   ├── client.ts
│   │   ├── notebooks.ts
│   │   ├── analytics.ts
│   │   └── index.ts
│   ├── auth/
│   │   └── session-context.tsx
│   ├── navigation/
│   │   └── config.ts
│   └── types.ts
```
