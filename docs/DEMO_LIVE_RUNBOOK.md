# Live demo runbook — Drivee Analytics Notebook

Цель: за 2–5 минут поднять стек и убедиться, что **менеджер** проходит сценарий  
**NL → intent → semantic → SQL → validation → Postgres → table/chart → insight → trace → save report**.

## Предпосылки

- Docker + Docker Compose v2
- Порты по умолчанию из корневого `.env`: frontend **3001**, backend **8000**, postgres **5434**

## Один шаг

```bash
make demo-live
```

Команда:
1. Поднимает `docker compose up -d` (frontend ждёт `backend` healthy).
2. Проверяет `GET /health` на backend.
3. Проверяет ответ главной страницы frontend.
4. Печатает URL и демо-учётки.

## Ручной запуск (если без Make)

```bash
docker compose up -d
# дождаться healthy backend (миграции + импорт train могут занять 1–3 мин на большом CSV)
curl -sf http://localhost:8000/health
open http://localhost:3001
```

## Демо-логин (manager)

- Email: `manager@drivee.local`
- Password: `demo123`

После входа:
1. **Сценарии** → открыть любой notebook или создать новый.
2. Ввести запрос (главный для жюри):  
   `Покажи выручку по городам за прошлую неделю`
3. Дождаться цепочки: clarification (если нужно) → SQL → результат → trace.
4. **Сохранить отчёт** из notebook UI → проверить в **Отчёты** / **История**.

## Train CSV

- По умолчанию монтируется [`backend/demo_data/train_minimal.csv`](../backend/demo_data/train_minimal.csv) (портативно).
- Для полного train: в `.env` задайте  
  `HOST_TRAIN_CSV_PATH=/absolute/path/to/train.csv`  
  и при необходимости `EXTERNAL_TRAIN_CSV_LIMIT` (например `20000`) для ускорения старта.

## Частые сбои

| Симптом | Причина | Действие |
|--------|---------|----------|
| 500 на `/api/v1/analytics/run` через `:3001` | Next proxy таймаут на долгий LLM+SQL | Убедиться, что `NEXT_PUBLIC_API_URL=http://localhost:8000` (см. `.env`) и сделать hard reload |
| Frontend 502/ECONNREFUSED | Backend ещё не healthy | `docker compose ps`, подождать, `make restart-stack` |
| Пустые графики | Мало строк в minimal CSV | Подключить полный train или увеличить лимит импорта |

## Проверка «живости» режима

- В UI/runtime badge: **postgres: required** — ожидаемо для live (нужна БД).
- Если включены mock SQL / fallback — должно быть **явно** видно в trace (см. runtime health и текст предупреждений).
