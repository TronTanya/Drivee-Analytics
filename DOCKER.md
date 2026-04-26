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

## 4) Полный `train.csv` при каждом старте backend (Docker)

В корневом `.env` задайте абсолютный путь к файлу на хосте:

```bash
HOST_TRAIN_CSV_PATH=/Users/you/Downloads/train.csv
SKIP_DEMO_TRAIN_SEED=true
EXTERNAL_TRAIN_CSV_LIMIT=-1
```

Compose смонтирует этот файл в контейнер как `/data/train.csv`; команда старта backend вызывает `import_train_csv.py --replace --limit -1` (вся выборка из файла). Описание колонок: **`docs/datasets/train-column-reference-ru.md`**.

**Если в ответах всё ещё «как из 10 строк»:** импорт при старте выполняется **только при запуске** entrypoint-цепочки контейнера `backend`. После смены `HOST_TRAIN_CSV_PATH` обязательно пересоздайте сервис:  
`docker compose up -d --force-recreate --no-deps backend`  
Иначе в БД останется старый набор (например `train_minimal`). Без пересоздания можно один раз залить CSV вручную:

```bash
docker compose run --rm -v "$HOME/Downloads/train.csv:/import/train.csv:ro" backend \
  python scripts/import_train_csv.py --path /import/train.csv --replace --limit -1
```

Строки с пустыми обязательными полями (`order_id`, `tender_id`, …) **отбрасываются** — в логе будет `Warning: dropped N rows`.

По умолчанию в `backend/.env.example` заданы высокие потолки выборки (`SQL_DEFAULT_LIMIT` / `SQL_EXECUTION_HARD_ROW_CAP`) и `SQL_TIMEOUT_SECONDS`, чтобы не обрезать полный датасет. На слабом стенде при необходимости **снизьте** эти значения — см. комментарии в `backend/.env.example`.

## 5) Загрузить свой `train.csv` в Postgres вручную (например ~16k строк)

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

### Полный `train.csv` и переменные compose

- В `docker-compose.yml` для сервиса **backend** по умолчанию задано **`EXTERNAL_TRAIN_CSV_LIMIT=-1`** (весь файл) и путь к CSV; при **`SKIP_DEMO_TRAIN_SEED=true`** демо-строки train в сиде не подменяют внешний импорт.
- После смены **`command`** / лимита импорта обычного `docker compose restart backend` **недостаточно**: контейнер сохранит старую команду. Нужно пересоздать сервис, например:  
  `docker compose up -d --force-recreate --no-deps backend`
- Для тяжёлого полного импорта увеличьте в **`backend/.env`** таймаут и лимиты SQL (см. комментарии в **`backend/.env.example`**).

## 6) Migrations and seed commands

```bash
make migrate
make seed
```

## 7) Safe backend restart (без ложных 500 на фронте)

Когда backend перезапускается, ему нужно время на startup (wait for Postgres, migrations, seed, uvicorn).  
Если в этот момент UI отправляет запросы через proxy, фронт может показать `500` (фактически `ECONNREFUSED` до backend).

Используйте безопасную цель:

```bash
make safe-restart-backend
```

Она делает `docker compose restart backend` и ждёт успешный `GET /health` перед завершением.

Or directly:

```bash
docker compose run --rm backend alembic upgrade head
docker compose run --rm backend python scripts/seed_demo_data.py
docker compose run --rm backend python -m pytest tests/unit/test_analytics_run_response_contract.py -q
```
