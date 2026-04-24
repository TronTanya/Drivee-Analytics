# Docker Runbook

## 1) Prepare env files

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Optional for frontend local overrides:

```bash
cp frontend/.env.example frontend/.env
```

`backend/.env` is where app-level secrets live (JWT, DeepSeek key, etc).  
`docker-compose.yml` overrides `DATABASE_URL` to use `postgres` container automatically.

## 2) Start all services

```bash
docker compose up --build
```

Services (порты по умолчанию; см. `FRONTEND_PORT`, `POSTGRES_PORT` в корневом `.env`):
- frontend: http://localhost:3000
- backend: http://localhost:8000
- postgres: localhost:5432

**CORS:** если фронт открыт на другом порту (например `FRONTEND_PORT=3001` из‑за занятого `:3000`), в `BACKEND_CORS_ORIGINS` / `CORS_ORIGINS` должен быть тот же origin (`http://localhost:3001`). В репозитории по умолчанию разрешены и `:3000`, и `:3001` (см. `docker-compose.yml` и `backend/.env.example`).

Backend startup sequence:
1. wait for PostgreSQL
2. run Alembic migrations
3. run idempotent demo seed
4. start FastAPI with uvicorn

`CORS_ORIGINS` для backend можно задавать как CSV или JSON-массив (оба формата поддерживаются конфигом).

### Обновление существующей БД: представление `train`

Если база создана до появления `public.train`, один раз в `psql`:

```sql
CREATE OR REPLACE VIEW public.train AS SELECT * FROM public.anonymized_incity_orders;
```

Свежий `bootstrap_drivee.sql` создаёт VIEW автоматически. Запросы notebook / NL→SQL и whitelist валидатора опираются на **`public.train`**; имя факт-таблицы под VIEW нужно только для DDL, ORM и сидов.

## 3) Optional pgAdmin

```bash
docker compose --profile tools up --build
```

pgAdmin:
- URL: http://localhost:5050
- credentials from `.env` (`PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD`)

## 4) Migrations and seed commands

```bash
make migrate
make seed
```

Or directly:

```bash
docker compose run --rm backend alembic upgrade head
docker compose run --rm backend python scripts/seed_demo_data.py
docker compose run --rm backend python -m pytest tests/unit/test_analytics_run_response_contract.py -q
```
