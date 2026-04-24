# Release Gate Checklist

## Scope

This checklist is used before demo/release cuts for the current MVP.

## 1) Runtime Mode Gate

- [ ] `NEXT_PUBLIC_API_MOCK` is set explicitly for the target run (`0`, `fallback`, or `all`).
- [ ] `APP_ENV` and `DEMO_AUTH_BYPASS_ENABLED` are explicitly set and reviewed.
- [ ] UI clearly indicates fallback mode where applicable.

## 2) Backend Gate

- [ ] `python3 -m compileall app` passes.
- [ ] `JWT_SECRET` is set for non-demo environments.
- [ ] `/api/v1/analytics/run` requires authenticated user.
- [ ] `/health` and `/api/v1/health` return `ok`.

## 3) Frontend Gate

- [ ] `npm run lint` passes in `frontend`.
- [ ] Login/register work against live backend.
- [ ] Data upload performs live preview/import (`/api/v1/data/upload`, `/api/v1/data/import/{id}/run`).
- [ ] Templates page uses existing backend templates contract.
- [ ] Dashboard pages render live data sources only.

## 4) Business Flow Smoke

- [ ] Notebook: NL prompt → SQL → table/chart → insight.
- [ ] Forecast block appears after insight and shows numeric values.
- [ ] Report can be saved and exported as PDF.
- [ ] Query history loads from `/api/v1/history`.
- [ ] Dictionary CRUD works for authenticated users.

## 5) Known Exceptions (Allowed)

- [ ] Scenario-level rerun/save actions in history remain disabled until backend endpoints exist.
- [ ] Report schedule delivery can use `email_mock` in MVP demos.

## 6) Docs Gate

- [ ] `README.md` links point to current docs.
- [ ] `docs/domain-contracts-and-runtime-modes.md` matches current API usage.
- [ ] `docs/platform-adaptation-qa-report.md` is filled for the target build.
