# Drivee Analytics Notebook

AI-first analytics workspace в формате notebook: от вопроса на естественном языке до SQL, таблиц, графиков, прогноза и explainability trace.

---

## 1) Название проекта

**Drivee Analytics Notebook** — demo-ready платформа self-service аналитики с role-based интерфейсом и прозрачным NL→SQL pipeline.

## 2) Проблема

Команды бизнеса, продукта и маркетинга часто упираются в:

- долгий цикл «вопрос → аналитик → SQL → график → объяснение»;
- слабую прозрачность AI-ответов;
- несогласованные метрики и словари;
- сложности с follow-up вопросами и контекстом диалога;
- разрыв между ad-hoc анализом и production-артефактами (report/schedule/history).

## 3) Решение

Drivee объединяет:

- **Notebook UX** для аналитического workflow;
- **orchestration backend** (intent, semantics, SQL generation/validation/execution);
- **trace/explainability layer**;
- **role dashboards** и системные разделы (reports/history/templates/dictionary/data upload);
- **learning loop** через corrections.

## 4) Почему notebook format сильнее обычного chat UI

Notebook лучше chat-only интерфейса для аналитики, потому что:

- сохраняет **структуру шагов** (prompt → SQL → table → chart → insight → forecast);
- делает результат **воспроизводимым** и пригодным для аудита;
- позволяет **добавлять/перезапускать** отдельные ячейки, а не терять поток в длинном чате;
- естественно поддерживает **trace + guardrails + validation** рядом с результатом;
- проще переводится в report/schedule/history артефакты.

## 5) Основные функции

- NL→SQL orchestration с explainability trace;
- smart chart recommendation;
- clarification flow при неоднозначности;
- follow-up context inheritance;
- correction learning loop;
- forecast sidecar;
- CSV upload + schema inference + import;
- role-based dashboards и template-driven старты.

### Supported metrics/scenarios after schema alignment

- Метрики: `orders_count`, `tenders_count`, `client_cancellations`, `driver_cancellations`, `done_rides`, `avg_order_price`, `sum_order_price`, `avg_duration_seconds`, `avg_distance_meters`, `done_conversion`, `time_to_accept_seconds`, `time_to_arrive_seconds`, `cancel_before_accept_count`.
- Сценарии: отмены по `city_id`, завершенные поездки по дням, средняя стоимость по `city_id`, топ городов по отменам, динамика заказов 7d, отмены до принятия.

## 6) Роли пользователей

- **Admin**: governance, dictionary, corrections, platform controls.
- **Manager**: ops/KPI мониторинг, гео и SLA сценарии.
- **Marketer**: качество заказов, отмены, завершения, ценовые метрики по `city_id`.
- **Executive**: KPI обзор, сценарии и прогнозные диапазоны.

## 7) Архитектура

```text
frontend (Next.js 14, App Router, TS, Tailwind)
        |
        v
backend (FastAPI + SQLAlchemy + Pydantic services)
        |
        v
PostgreSQL (product tables + notebook artifacts + ds/forecast metadata)
```

- `frontend/` — UI shell, notebook canvas, dashboards, system pages.
- `backend/` — API, orchestration services, validation, persistence.
- `backend/sql/` — bootstrap + demo seed.

## 8) Backend pipeline

Упрощенный execution flow:

1. preprocess query;
2. dialogue context resolution (follow-up detection + rewrite);
3. intent classification + entity extraction;
4. semantic term resolution;
5. clarification evaluation + confidence scoring;
6. SQL generation (+ optional learned correction);
7. SQL validation (guardrails);
8. SQL execution;
9. visualization recommendation;
10. insight + optional forecast;
11. trace payload build + persistence.

## 9) PostgreSQL schema overview

Ключевые таблицы (группами):

- **Core auth/workspace**: `users`, `roles`, `workspaces`, `workspace_memberships`
- **Notebook runtime**: `notebooks`, `notebook_cells`, `cell_runs`
- **Knowledge & learning**: `query_corrections`, semantic/dictionary tables, NL/SQL logs
- **Templates & reports**: `query_templates`, `saved_reports`, `report_schedules`
- **Dashboards**: `dashboards`, `dashboard_widgets`
- **Data/DS**: `uploaded_files`, `data_import_jobs`, `inferred_schemas`, `forecast_runs`, `forecast_results`
- **Canonical business source**: `anonymized_incity_orders` (единый источник для runtime и demo)

### Canonical in-city schema (confirmed)

- **IDs**: `city_id`, `order_id`, `tender_id`, `user_id`, `driver_id`
- **Statuses**: `status_order`, `status_tender`
- **Timestamps**: `order_timestamp`, `tender_timestamp`, `driveraccept_timestamp`, `driverarrived_timestamp`, `driverstarttheride_timestamp`, `driverdone_timestamp`, `clientcancel_timestamp`, `drivercancel_timestamp`, `order_modified_local`, `cancel_before_accept_local`
- **Trip metrics**: `distance_in_meters`, `duration_in_seconds`, `price_order_local`, `price_tender_local`, `price_start_local`, `offset_hours`

## 10) Frontend routes

Основные роуты:

- Auth: `/login`, `/register`
- Demo hub: `/demo-router`
- Dashboards:
  - `/dashboard/admin`
  - `/dashboard/manager`
  - `/dashboard/marketer`
  - `/dashboard/executive`
- Notebook:
  - `/notebooks`
  - `/notebooks/[id]`
- System:
  - `/reports`
  - `/history`
  - `/templates`
  - `/dictionary`
  - `/data-upload`
  - `/settings`

## 11) Smart visualization

После успешного SQL execution backend выбирает рекомендованный тип графика на основе:

- intent;
- формы результата (columns/row patterns);
- сигнала из запроса пользователя.

Результат возвращается в trace (`chart_recommendation`) и отображается в UI.

## 12) Clarification flow

Если запрос неоднозначен:

- pipeline не запускает SQL;
- формирует вопрос-уточнение и варианты;
- выставляет `clarification_requested=true`;
- сохраняет статус в trace + ячейке.

Это снижает риск «уверенно неверных» ответов.

## 13) Context-aware dialogue

Dialogue engine поддерживает follow-up:

- определяет, что запрос является продолжением;
- наследует релевантный контекст из notebook state;
- формирует rewritten query для исполнения;
- пишет inheritance trace для explainability.

## 14) Learning from corrections

Admin/аналитик может зафиксировать correction:

- исходный SQL;
- corrected SQL;
- причина исправления.

При совпадении паттерна correction применяется автоматически (с trace-метками), формируя feedback loop.

## 15) Data Science layer

DS слой покрывает:

- профилирование загруженных данных;
- базовые агрегаты и метрики;
- forecasting;
- генерацию текстовых инсайтов;
- связывание DS-контекста с notebook workflow.

## 16) CSV ingestion

Flow:

- upload файла;
- валидация и preview;
- schema inference;
- создание import job;
- импорт в staging;
- связывание с notebook контекстом.

## 17) Forecasting

Forecast sidecar активируется по intent/запросу:

- рассчитываются horizon points;
- формируются baseline/low/high диапазоны;
- trace фиксирует `forecast_mode.active` и `forecast_mode.method`.

## 18) SQL guardrails

Перед выполнением SQL проходит validation layer:

- ограничения по policy/роли;
- проверка небезопасных паттернов;
- предупреждения и статус валидации;
- блокировка выполнения при критических ошибках.

## 19) Запуск frontend/backend

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

По умолчанию frontend ожидает backend на `http://localhost:8000`.

## 20) Настройка PostgreSQL

1. Поднимите PostgreSQL (локально или в Docker).
2. Создайте БД и пользователя.
3. Укажите переменные окружения backend (`DATABASE_URL` и related settings).
4. Примените bootstrap SQL и migrations (если используются в вашей ветке).

## 21) Seed data

Для demo-данных используйте:

- `backend/sql/bootstrap_drivee.sql`
- `backend/sql/seed_demo.sql`

Seed создает реалистичные сценарии по подтвержденной in-city схеме: notebooks, cells, templates, reports, forecast runs, corrections.

## 22) Demo scenarios

Рекомендуемый demo-script:

1. Login → `/demo-router`
2. Manager dashboard → `ops-health` notebook
3. Показать clarification + follow-up + trace panel
4. Marketer dashboard → cancellations/done rides/avg price scenarios
5. Executive dashboard → orders forecast narrative
6. Reports/history/templates/dictionary/data-upload
7. Admin dashboard → corrections queue + suggestions

## 23) Соответствие критериям оценки

Ниже — как текущий MVP закрывает judging-критерии (что уже сделано и почему это важно для бизнеса).

### 1. Ценность решения для бизнеса (0–15)

- Проблема “долгого пути от вопроса до ответа” закрывается через notebook-flow: `prompt → SQL → table → chart → insight`.
- Бизнес-пользователь получает ответ без ручного SQL в большинстве сценариев.
- Снижена зависимость от узких технических специалистов за счет role-based UX, шаблонов и словаря терминов.

### 2. Качество MVP и реализуемость (0–20)

- Рабочий end-to-end прототип реализован:
  - текстовый запрос (`/notebooks/[id]`)
  - SQL generation/validation/execution (backend orchestration)
  - визуализация и insight в notebook cells
- MVP демонстрирует реалистичный пользовательский путь, а не “статичные моки одного экрана”.

### 3. Точность NL → SQL интерпретации (0–20)

- В pipeline есть этапы: intent classification, entity extraction, semantic resolution.
- Поддерживаются метрики, фильтры, сравнения, follow-up контекст, chart recommendation.
- Есть confidence score и trace-пояснение, чтобы видеть, как именно система интерпретировала запрос.

### 4. Корректность SQL и работы с данными (0–15)

- SQL проходит валидацию до выполнения.
- В trace выводятся `generated_sql`, `validation_status`, `warnings`, `tables_used`.
- При невалидном/рискованном запросе выполнение блокируется или помечается как проблемное, что повышает устойчивость.

### 5. Безопасность и guardrails (0–15)

- Реализован SQL validation слой и status signaling в trace.
- Есть role-aware навигация и модель доступа по ролям (admin/manager/marketer/executive).
- Есть база для policy-based ограничений и governance (roadmap: production RBAC + query governance).

### 6. UX / explainability / визуализация (0–10)

- Полноценный Trace Panel с explainability: intent, entities, semantic terms, SQL, validation, confidence, forecast mode.
- Унифицированные chart containers и notebook UX с polished состояниями.
- Доступны routes для report/history/templates/dictionary, что упрощает путь к “сохранить и переиспользовать”.

### 7. Качество демо и ответы на вопросы (0–5)

- Подготовлен demo-router и сценарный путь по ролям.
- Демо показывает не только happy path, но и clarification, warnings, corrections.
- Понятный путь масштабирования зафиксирован в roadmap.

### 8. Сохранение отчета и расписание рассылки (0–5)

- Реализованы сущности и UI-поток для reports/scenarios/schedules.
- На frontend доступны экраны `/reports` и связанные действия (save/rerun/edit schedule в MVP-режиме).
- В backend присутствуют модели `saved_reports`, `report_schedules`.

### 9. Семантический слой / словарь бизнес-терминов (0–5)

- Есть dictionary flow (`/dictionary`) и seed для semantic terms/synonyms.
- Семантический слой участвует в NL→SQL и повышает бизнес-корректность интерпретации.
- Это уменьшает расхождения в трактовке KPI между командами.

### 10. Обработка неоднозначных запросов / confidence score (0–5)

- Clarification engine задает уточняющие вопросы при неоднозначности.
- Confidence score и предупреждения доступны в trace.
- Система явно показывает, когда нужен follow-up пользователя вместо “выдуманного” ответа.

### 11. Шаблоны типовых вопросов / переиспользуемые сценарии (0–5)

- Реализованы templates (`/templates`) и reusable notebook scenarios.
- Role-specific quick prompts ускоряют старт анализа.
- Это снижает порог входа и повышает повторяемость аналитических процессов.

## 24) Примеры кода, данных и графиков по критериям

Ниже — примеры на **подтвержденной схеме in-city заказов**.

### A. End-to-end: текстовый запрос → SQL → таблица → график  
**Критерии:** 1, 2, 3, 4, 6

**NL запрос (пример):**

```text
Покажи количество отмен по city_id за прошлую неделю.
```

**Интерпретация (упрощенно):**

```json
{
  "interpreted_intent": "comparison · client_cancellations",
  "extracted_entities": { "window_days": 7, "dimension": "city_id" },
  "semantic_terms": ["client_cancellations"]
}
```

**Сгенерированный SQL (пример):**

```sql
SELECT
  city_id,
  COUNT(*) FILTER (
    WHERE clientcancel_timestamp IS NOT NULL
       OR drivercancel_timestamp IS NOT NULL
  )::bigint AS cancellations
FROM public.anonymized_incity_orders
WHERE order_timestamp >= current_date - interval '7 day'
GROUP BY 1
ORDER BY 2 DESC;
```

### B. Guardrails и корректность SQL  
**Критерии:** 4, 5

```sql
SELECT * FROM semantic_terms st JOIN anonymized_incity_orders o ON TRUE;
```

```json
{
  "validation_status": "failed",
  "warnings": ["Cartesian join risk detected"],
  "execution_status": "not_started"
}
```

### C. Explainability trace  
**Критерии:** 6, 10

```json
{
  "schema_version": 1,
  "interpreted_intent": "comparison · client_cancellations",
  "tables_used": ["anonymized_incity_orders"],
  "validation_status": "passed",
  "confidence": 0.86,
  "clarification_requested": false,
  "follow_up_context_used": true,
  "learned_correction_used": false,
  "chart_recommendation": { "chart_type": "horizontal_bar" },
  "forecast_mode": { "active": false, "method": null }
}
```

### D. Clarification flow  
**Критерии:** 3, 10

```json
{
  "clarification_requested": true,
  "clarification_question": "Уточните, какую метрику сравнить по city_id?",
  "clarification_options": [
    { "id": "orders_count", "label": "Количество заказов" },
    { "id": "client_cancellations", "label": "Отмены клиентом" },
    { "id": "avg_order_price", "label": "Средняя стоимость заказа" }
  ],
  "confidence": 0.56,
  "validation_status": "pending"
}
```

### E. Follow-up контекст и corrections  
**Критерии:** 3, 4, 10

```text
Q1: "Покажи количество отмен по city_id за 7 дней"
Q2: "а теперь только по city_id=101"
```

```json
{
  "follow_up_context_used": true,
  "rewritten_query_for_execution": "Покажи количество отмен по city_id=101 за 7 дней"
}
```

### F. Семантический слой  
**Критерии:** 9

| term_key                  | synonyms                                  | metric_formula_sql |
|--------------------------|-------------------------------------------|--------------------|
| orders_count             | заказы, orders                            | `COUNT(*)` |
| done_rides               | завершенные поездки, done rides           | `COUNT(CASE WHEN driverdone_timestamp IS NOT NULL THEN 1 END)` |
| client_cancellations     | отмены клиентом, client cancellations     | `COUNT(CASE WHEN clientcancel_timestamp IS NOT NULL THEN 1 END)` |
| avg_order_price          | средняя стоимость заказа, avg order price | `AVG(price_order_local)` |

### G. Reports и templates  
**Критерии:** 8, 11

| report_name                      | source_notebook                        | schedule | format |
|----------------------------------|----------------------------------------|----------|--------|
| Weekly cancellations by city_id  | Ops — cancellations by city_id         | active   | PDF    |
| Forecast pack — orders           | Executive forecast — orders 8w         | active   | PDF    |

| template_key               | role      | nl_prompt_template                                      |
|---------------------------|-----------|---------------------------------------------------------|
| weekly_cancellations_by_city | manager | Покажи количество отмен по city_id за прошлую неделю |
| done_rides_daily          | marketer  | Сравни количество завершенных поездок по дням          |
| top_city_cancellations    | executive | Топ-3 города по количеству отмененных заказов          |

### H. Forecasting (MVP DS layer)  
**Критерии:** 2, 6, 10

Прогноз строится на реальных series:
- `orders_count` от `order_timestamp`
- `done_rides` от `driverdone_timestamp`
- `cancellations_total` от `clientcancel_timestamp` + `drivercancel_timestamp`
- `sum_order_price` от `price_order_local`

## 25) Roadmap

- v1 production auth + RBAC policies end-to-end
- v1 query cost governance + workload controls
- richer semantic layer (taxonomy, lineage, quality rules)
- advanced forecasting models + backtesting UI
- collaborative notebooks (comments, approvals, share links)
- observability suite (traces/metrics/errors) for AI pipeline
- stronger CI/CD + test coverage for orchestration logic

---

## Tech stack (коротко)

- **Frontend**: Next.js 14, TypeScript, Tailwind, React Query, Recharts
- **Backend**: FastAPI, SQLAlchemy, Pydantic
- **DB**: PostgreSQL
- **UX**: role-based dashboards + notebook-native analytics flow
