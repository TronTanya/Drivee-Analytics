# PostgreSQL Layer (Drivee Analytics Notebook)

## Scope

PostgreSQL is the primary storage for:
- identity and roles
- notebooks and cells
- NL->SQL history and explainability traces
- reports and schedules
- semantic dictionary and templates
- dashboards and widgets
- corrections and audit logs
- CSV ingestion metadata and dataset versions
- metric snapshots, forecasts, anomalies
- canonical analytics surface **`public.incity_orders`** (VIEW over the physical orders table; single logical source for NL→SQL in MVP)

### User SQL whitelist (MVP)

Ad-hoc / NL→SQL execution is allowed to touch only:

- **`public.incity_orders`** — the logical analytics table (queries and generated SQL should reference this name).
- **`user_staging.t_*`** — CSV upload staging tables (pattern from config).

The physical backing table for the VIEW exists for ORM, bootstrap DDL, and bulk seed scripts; it is **not** listed in the SQL table whitelist and must not appear in user-facing SQL. See `app/core/config.py` (`sql_whitelist_tables` / staging pattern).

## Environment

Supported variables:
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL` (optional override; if empty, built from `POSTGRES_*`)

## Migration Strategy

- Baseline revision: `alembic/versions/202604211740_baseline_platform_schema.py`
- For next changes:
  1. Add/adjust SQLAlchemy model
  2. Create revision (`alembic revision -m "..."`)
  3. Keep revisions domain-focused (auth/notebook/semantic/etc)
  4. Prefer additive migrations and reversible downgrade paths

## Seed Strategy

`scripts/seed_demo_data.py` is idempotent and seeds:
- roles and demo users (+ profiles)
- workspace + memberships
- semantic terms + synonyms
- query templates
- in-city order scenarios aligned to `city_id`, `status_order`, timestamps and trip metrics
- demo notebook, notebook cell, query history
- demo saved report
