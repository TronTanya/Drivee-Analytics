# Runbook: 5 сценариев для жюри

Короткий маршрут для стабильного демо через `/scenarios`.

## Перед показом

1. Поднимите стенд: `make up`
2. Прогоните стабильный минимум:
   - `make test-smoke`
   - `make test-nl`
   - `make test-guardrails`
3. Опционально: `make test-cov-core`
4. Проверьте вход в UI и доступность `ops-health`.

## Сценарий 1 — RU запрос → table/chart/insight/forecast

- Откройте карточку: `Сценарий 1` в `/scenarios`.
- Автозапуск подставит промпт с прогнозом.
- Покажите:
  - таблицу и график;
  - insight-блок;
  - в Trace секцию `Прогноз` с explainability/предупреждением.

## Сценарий 2 — Trace / explainability

- Откройте карточку: `Сценарий 2`.
- В правой панели Trace последовательно покажите:
  - intent;
  - metric;
  - generated SQL;
  - quality gate;
  - forecast explainability.

## Сценарий 3 — Неоднозначность и clarification

- Откройте карточку: `Сценарий 3`.
- Для кейса `выручка`/`лучшие каналы` покажите:
  - `Нужно уточнение`;
  - выбор варианта в clarification-cell;
  - перезапуск;
  - обновлённый результат и trace.

## Сценарий 4 — Guardrails

- Откройте карточку: `Сценарий 4`.
- Автозапуск отправляет длинный промпт.
- Ожидаемый результат:
  - блокировка guardrails;
  - понятная пользовательская ошибка (без тех.шума);
  - причины в Trace (`guardrails`, `quality gate: failed`).

## Сценарий 5 — Честные ограничения MVP

- В notebook покажите блок `Ограничения демо (честно)`:
  - baseline forecast строится по SQL-ряду и explainability trace; это не production ML;
  - live SQL может перейти в mock/stub fallback;
  - dictionary/API может быть упрощён в зависимости от env;
  - чувствительные метрики/сущности ограничены ролями;
  - live DB зависит от корректной конфигурации окружения.

Формулировка для комиссии: «Это зрелый MVP с controlled degradation и прозрачным trace. При недоступности части контуров система не маскирует риск, а явно сообщает runtime-профиль выполнения (Live / fallback / mock-only)».

## Что включать в CI (стабильно)

- Включать:
  - `make test-smoke`
  - `make test-nl`
  - `make test-guardrails`
- Отдельно/manual:
  - `make test-e2e` (browser E2E запускаются как release/demo gate, а не как обязательный шаг каждого CI-прогона)

## Автопроверка jury-режима

- Локально: `cd frontend && npm run test:e2e:jury`
- Через Makefile: `make test-e2e` (запустит `defense` + `jury` e2e-спеки).
- Быстрый прогон без повторного логина: `make test-e2e-quick` (через Playwright `storageState`).

## Работает ли нейросеть (LLM)

- В бэкенде подключён **только DeepSeek** (`LLM_PROVIDER=deepseek`, см. `backend/app/services/llm/factory.py`).
- Если **`DEEPSEEK_API_KEY` пустой** (типичный локальный/CI профиль): провайдер **не создаётся**, `LLMService.is_enabled == false`, **внешние вызовы к API нет**. NL→SQL, intent и шаблонный SQL идут по **детерминированным правилам** (IntentService, SemanticParser, SQLGenerationService, жёсткие сценарии вроде QR/KPI/Q1-среза).
- Если **ключ задан**: LLM может обогащать интерпретацию запроса, follow-up, уточнения (где включено вторым контуром), инсайты и explainability; при серии ошибок включается **cooldown** (circuit breaker в `LLMService`).
- При старте API в лог пишется строка `llm_startup enabled` или `llm_startup disabled reason=...` (`log_llm_startup_summary`).

**Как проверить на стенде:** задать переменную `DEEPSEEK_API_KEY` в `backend/.env`, перезапустить backend, открыть Trace — появятся сигналы вида `llm:*`, если модель реально вызывалась.

## Сложные вопросы для жюри (шпаргалка ответов)

Ниже — формулировки, которые комиссия может задать «в лоб», и **как система должна вести себя** при работающем Postgres и актуальном коде (без ключа LLM ответы всё равно детерминированы по правилам).

| Тема | Пример формулировки | Ожидаемое поведение |
|------|---------------------|---------------------|
| QR по дням | «Качественная метрика (QR): заказы, принятые по стартовой цене за 10 минут, в разрезе дня за февраль 2025 по всем городам» | Intent **trend**, SQL с `date_trunc('day', …)`, `FILTER` по времени принятия и `price_order_local = price_start_local`, **без** топа по `city_id`. |
| Два измерения времени+город | «Уникальные отмены пассажира после начала поездки в разрезе месяца и города в 2026» | Intent **trend**, ось времени по `clientcancel_timestamp`, `bucket` + `dim` = город; см. коэрсинг в оркестраторе. |
| Топ до принятия | «Топ-3 городов, теряющих заказы до принятия водителем в 2025» | Флаг `lost_orders_before_driver_accept_top`, SQL к `cancel_before_accept_local`, `LIMIT 3`. |
| Двухэтапная воронка | «Конверсия в принятие и в завершение поездки по всей сети за июнь 2025» | `funnel_two_stage_conversion`, один SELECT с двумя конверсиями. |
| Сводка без метрики | «Покажи лучшие города за неделю» | **Clarification** (критерий «лучшие»). |
| Безопасность | Промпт с `DROP TABLE` / произвольный DDL | **Guardrails**, SQL не выполняется. |
| Сравнение с прошлым без базы | «Динамика отмен vs прошлый месяц» без уточнения базы | **Clarification** `comparison_baseline_unspecified` (если сработали правила). |
| KPI последний полный месяц | «За последний полный месяц выручка, завершённые поездки и средний чек по каждому городу» | `multi_kpi_last_full_month_by_city`, intent **comparison**, три метрики в одном запросе. |
| Срез водителей Q1 | «Срез эффективности водителей по городам за Q1 2025: rides, online hours, rides per online hour» | `driver_efficiency_slice_q1_by_city`, таблица `driver_daily_metrics`. |

Если ответ «не тот», в первую очередь смотрите **Trace**: intent, `entities`, сырой SQL и `sql_generation.source` (semantic vs template vs learned_correction).
