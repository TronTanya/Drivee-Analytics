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

Если `5432` уже занят локальным Postgres, это нормальный инфраструктурный конфликт для dev-машины: задайте другой `POSTGRES_PORT` в корневом `.env` (например `55432`) и перезапустите compose.

**CORS:** в `docker-compose` для фронта по умолчанию **`NEXT_PUBLIC_API_URL=same-origin`** и прокси **`API_PROXY_TARGET=http://backend:8000`** — браузер ходит только на хост/порт фронта (`/api/*` → Next → backend), **CORS в браузере не нужен**. Если вы переопределили `NEXT_PUBLIC_API_URL` на прямой `http://localhost:8000`, тогда origin фронта (в т.ч. `http://localhost:3001` при `FRONTEND_PORT=3001`) должен входить в `BACKEND_CORS_ORIGINS` / `CORS_ORIGINS`.

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

## 4) Загрузить свой `train.csv` в Postgres (например ~16k строк)

Файл должен иметь те же колонки, что и экспорт (см. `anonymized_incity_orders` / `bootstrap_drivee.sql`).  
`public.train` — это VIEW: данные пишутся в **`anonymized_incity_orders`**.

Из корня репозитория (путь к CSV можно заменить):

```bash
./scripts/import_train_csv_docker.sh ~/Downloads/train.csv 20000
```

- Второй аргумент — сколько **строк из файла** прочитать (с заголовком не считая). Часть строк с пустыми `tender_id` / обязательными полями отбрасывается; при цели «≈16000» обычно берут **20000**.
- Флаг `--replace` внутри скрипта: перед импортом таблица **очищается** (только для dev).

Вручную без shell-обёртки:

```bash
docker compose run --rm -v "$HOME/Downloads/train.csv:/import/train.csv:ro" \
  backend python scripts/import_train_csv.py --path /import/train.csv --limit 20000 --replace
```

## 5) Migrations and seed commands

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
