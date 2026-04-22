# Drivee Analytics Notebook — Demo Readiness Matrix

## Stable (main demo)

- `frontend/app/(platform)/demo-router/page.tsx`
- `frontend/app/(platform)/notebooks/page.tsx`
- `frontend/app/(platform)/notebooks/[id]/page.tsx`
- `frontend/components/notebook/*`
- `frontend/lib/notebook/trace-model.ts`
- `frontend/lib/notebook/legacy-map.ts`
- `frontend/lib/api/request.ts`
- `frontend/lib/api/mocks/index.ts`

## Unstable (advanced only)

- `frontend/app/(platform)/forecast-lab/page.tsx`
- `frontend/components/system/data-upload-client.tsx` (stabilized in demo mode, still advanced)
- `frontend/app/(platform)/reports/page.tsx` (kept for report-reuse scenario, not first hop)
- `frontend/app/(platform)/history/page.tsx` (kept for report-reuse scenario, not first hop)

## Optional (only if time remains in defense)

- `frontend/app/(platform)/history/page.tsx`
- `frontend/app/(platform)/forecast-lab/page.tsx`
- `frontend/app/(platform)/data-upload/page.tsx`
- `frontend/app/(platform)/dictionary/page.tsx`

## Removed from main path

- AutoML/forecast/data-upload are removed from primary nav entrypoint and moved to advanced links in demo-router.

## Demo profile

- Default mode for defense: `Live + fallback`.
- Environment:
  - `NEXT_PUBLIC_DEMO_MODE=true`
  - `NEXT_PUBLIC_API_MOCK=fallback`
- Result:
  - tries live backend first;
  - gracefully degrades to deterministic mock chain without dead-end UI.

