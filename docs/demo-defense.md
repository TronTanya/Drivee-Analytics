# Демонстрация для защиты проекта

Документ описывает **честный demo-режим**, четыре опорных сценария, запуск окружения и формулировки ограничений для комиссии.

## Как запускать демо

1. **Backend** (PostgreSQL, миграции, переменные из `backend/.env.example`).
2. **Seed** (пользователи, workspace, семантика, шаблоны, ноутбук, история, сценарии защиты):

   ```bash
   make seed
   # или: docker compose run --rm backend python scripts/seed_demo_data.py
   ```

3. **Frontend** — рекомендуемый профиль для защиты:

   | Переменная | Значение | Смысл |
   |------------|----------|--------|
   | `NEXT_PUBLIC_DEMO_MODE` | `true` | Включает «робастный» профиль: по умолчанию `NEXT_PUBLIC_API_MOCK` ведёт себя как **fallback**, если переменная не задана (см. `frontend/lib/api/config.ts`). |
   | `NEXT_PUBLIC_API_MOCK` | `fallback` или не задавать при `DEMO_MODE=true` | Сначала **живые** запросы к API; при ошибке сети, 5xx, 401, 403 — контролируемый mock. |
   | `NEXT_PUBLIC_DEMO_FORCE_ANALYTICS_MOCK` | не задавать или `false` | **Важно:** аналитика `/api/v1/analytics/run` идёт в backend, как в бою. Мок подставляется **только** при сбое и только если включён fallback-профиль. |
   | `NEXT_PUBLIC_DEMO_FORCE_ANALYTICS_MOCK` | `true` | Только для офлайн-показа: весь analytics на клиентском моке (явно «не честный» live). |

4. Войти демо-пользователем — см. **[demo-users-credentials.md](./demo-users-credentials.md)**.

5. Точка входа UI после входа: **`/notebooks`** — список сценариев; дальше открывайте нужный ноутбук (например **`/notebooks/ops-health`**). Канонические промпты защиты — **`frontend/lib/demo/defense-scenarios.ts`**.

## Четыре сценария (что показывать)

Каноническое описание полей (промпт, seed, ожидание, fallback) дублируется в коде: `frontend/lib/demo/defense-scenarios.ts` — его удобно держать открытым во время доклада.

| # | Сценарий | Где показывать | NL-промпт (копировать в ноутбук) |
|---|-----------|----------------|-----------------------------------|
| 1 | Быстрый бизнес-вопрос | `/notebooks/ops-health` | См. `DEFENSE_DEMO_SCENARIOS[0].nlPrompt` |
| 2 | Сравнительный анализ | `/notebooks/ops-health` | См. `DEFENSE_DEMO_SCENARIOS[1].nlPrompt` |
| 3 | Регулярная отчётность | `/notebooks/ops-health` → при желании `/reports` | См. `DEFENSE_DEMO_SCENARIOS[2].nlPrompt` |
| 4 | Совместная работа через шаблоны | `/templates` + `/notebooks/ops-health` | См. `DEFENSE_DEMO_SCENARIOS[3].nlPrompt` |

После seed в БД появляются строки истории с `trace_payload_json.defense_scenario_id` — это **маркеры сценария**, а не подмена ответа LLM.

## Источник данных для аналитики

- В живой БД NL→SQL и шаблоны опираются на **`public.train`** (VIEW над факт-таблицей заказов; колонки описаны в `docs/demo-analytics-dataset.md`).
- **Whitelist** пользовательского SQL: только **`train`** и таблицы staging в **`user_staging`** после импорта CSV; имя физической таблицы под VIEW в запросах не допускается (см. `README.md` §10, `backend/POSTGRES_LAYER.md`).
- Клиентский fallback (`mockRunAnalytics`, `SEEDED_ORDERS`) — отдельный контур: детерминированные цифры для демо при сбое сети, не построчная копия Postgres.

## Ограничения (озвучивать честно)

- **Live-first:** при выключенном принудительном моке аналитики ответ зависит от backend и (если включено) от внешнего LLM; повторяемость цифр не гарантируется без фиксированного датасета и промпта.
- **Fallback:** при ошибке запроса к `/api/v1/analytics/run` срабатывает клиентский детерминированный ответ (`mockRunAnalytics`). Он **подписан** в UI как controlled / mock dataset и использует фиксированный набор `SEEDED_ORDERS` — это не «реальная» выгрузка из вашей БД.
- **Heuristics fallback:** ветки «сравнение», «операционная сводка», «шаблон» в моке определяются **ключевыми словами в тексте промпта**; произвольный формулировкой может попасть в ветку по умолчанию (ranking по отменам).
- **Дашборды и часть списков** могут оставаться на mock/fallback независимо от analytics — см. `docs/demo-readiness-matrix.md` и `docs/improvement-roadmap.md`.
- **PDF / локальные снимки** отчётов могут обходиться без полного backend — это отдельный контур.

## Связанные документы

- `docs/demo-script.md` — пошаговый сценарий экрана.
- `docs/demo-readiness-matrix.md` — зрелость маршрутов.
- `docs/demo-analytics-dataset.md` — объёмный демо-датасет `DEMO-*`.
- `docs/architecture.md` — архитектурная схема и этапы NL→SQL.
- `README.md` — возможности MVP, ограничения, запуск, критерии оценки.
- `backend/scripts/seed_demo_data.py` — данные и шаблоны workspace.
