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

Services:
- frontend: http://localhost:3000
- backend: http://localhost:8000
- postgres: localhost:5432

Backend startup sequence:
1. wait for PostgreSQL
2. run Alembic migrations
3. run idempotent demo seed
4. start FastAPI with uvicorn

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
```
