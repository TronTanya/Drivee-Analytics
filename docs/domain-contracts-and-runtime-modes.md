# Domain Contracts And Runtime Modes

## Purpose

This document is the baseline contract between product intent and implementation.
It defines:

- the canonical backend API per domain;
- the expected frontend runtime mode per screen (`live`, `fallback`, `mock-only`);
- temporary exceptions that are allowed only for demo continuity.

## Domain Contract (Source Of Truth)

- `auth`
  - Backend: `/api/v1/auth/*`
  - Frontend API layer: `frontend/lib/api/auth.ts`
  - Status: partial (API is real, part of UI still uses local session simulation)
- `notebooks` and `analytics`
  - Backend: `/api/v1/notebooks/*`, `/api/v1/analytics/run`
  - Frontend API layer: `frontend/lib/api/notebooks.ts`, `frontend/lib/api/cells.ts`
  - Status: live
- `history`
  - Backend: `/api/v1/history`
  - Frontend API layer: `frontend/lib/api/history.ts`
  - Status: live for listing; rerun/save actions are frontend-local fallbacks
- `reports`
  - Backend: `/api/v1/reports/*`
  - Frontend API layer: `frontend/lib/api/reports.ts`
  - Status: live, schedule delivery remains stub (`email_mock`)
- `templates`
  - Backend: `/api/v1/templates`, `/api/v1/templates/{id}/run`
  - Frontend API layer: `frontend/lib/api/templates.ts`
  - Status: live for query templates; notebook templates mapped from query templates when dedicated endpoint is absent
- `dictionary`
  - Backend: `/api/v1/dictionary/entries*`
  - Frontend API layer: `frontend/lib/api/dictionary.ts`
  - Status: live
- `data-upload`
  - Backend: `/api/v1/data/upload`, `/api/v1/data/import/{upload_id}/preview`, `/api/v1/data/import/{upload_id}/run`
  - Frontend API layer: `frontend/lib/api/data-upload.ts`
  - Status: live-first with fallback
- `forecast`
  - Backend: `/api/v1/forecast/*`
  - Frontend API layer: `frontend/lib/api/forecast.ts`
  - Status: live-first with fallback

## Runtime Mode Matrix

- `notebooks/[id]`
  - target mode: `live`
  - allowed fallback: yes (network/5xx/auth in demo profiles)
- `reports`
  - target mode: `live`
  - allowed fallback: yes
- `history`
  - target mode: `live` (query/listing)
  - allowed fallback: yes
  - exception: scenario-level rerun/save actions can be disabled if backend endpoint is unavailable
- `templates`
  - target mode: `live`
  - allowed fallback: yes
- `dictionary`
  - target mode: `live`
  - allowed fallback: yes
- `data-upload`
  - target mode: `live`
  - allowed fallback: yes
- `dashboard/*`
  - target mode: `live`
  - allowed fallback: no static mock tiles as primary source

## Guardrails For Mode Usage

- `mock-only` is allowed only when `NEXT_PUBLIC_API_MOCK=all` or explicit QA scenarios require it.
- `fallback` is allowed only on runtime failures; it must not shadow successful live responses.
- UI should explicitly surface when the user sees fallback data.

## Definition Of Done For Runtime Correctness

- A screen is considered `live` only if primary data comes from backend endpoints.
- A screen is considered `fallback-safe` only if failed live calls visibly degrade with clear user messaging.
- A domain is considered `contract-aligned` only if frontend paths map to existing backend routes.
