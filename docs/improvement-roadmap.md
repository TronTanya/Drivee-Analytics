# Drivee Analytics — аудит репозитория и improvement roadmap

Документ фиксирует **текущее состояние** кодовой базы (frontend + backend), **разрывы** между UI и API, **приоритеты** и **последовательность** эволюционных улучшений без переписывания стека.

---

## 1. Executive summary

Продукт уже содержит **сквозной NL→SQL orchestration** (intent → semantics → SQL → validation → execution → chart → insight → trace), **notebook API**, **отчёты и расписания на backend**, **CSV/forecast data layer** и **ролевой shell**. Часть системных экранов (история, шаблоны, словарь, глобальные расписания) **подключена к URL, которые не совпадают с реальными FastAPI-маршрутами** — в демо это компенсируется `NEXT_PUBLIC_API_MOCK` / `fallback` и моками в `frontend/lib/api/mocks`. Для **demo-ready MVP с доверием** критично выровнять контракты или явно маркировать «stub only».

---

## 2. Пользовательские сценарии: что работает end-to-end

| Сценарий | Статус | Комментарий |
|----------|--------|-------------|
| Регистрация / логин / refresh / `me` | **E2E готов** | `POST /api/v1/auth/*`, JWT; frontend `login` / `register`. |
| Список и деталь notebook, ячейки, сохранение | **E2E готов** | `GET/POST /api/v1/notebooks`, `POST .../cells`, `POST .../cells/{id}/run`, `save`, `rerun`. |
| NL-промпт → pipeline (SQL, таблица, график, insight, trace) | **E2E готов** при живом API | `POST /api/v1/analytics/run` → `run_pipeline` / `analyze_natural_language` → orchestrator. Зависит от `MOCK_MODE`, БД, LLM-ключа. |
| Запуск prompt cell из notebook API | **E2E готов** | Тот же orchestration через `NotebookService.run_cell`. |
| CSV upload → preview → import → привязка к notebook | **E2E готов** на backend | `POST/GET /api/v1/data/upload*`, `import/*`, `link-upload`. |
| Профиль источника, refresh MV | **Backend готов** | `/api/v1/data/default-source/*`. |
| Forecast run, backtest, список/деталь run | **Backend готов** | `/api/v1/forecast/*`. |
| Создание/список/деталь отчёта, run, PDF download, schedule CRUD | **E2E готов** | `/api/v1/reports` (+ nested schedule). |
| Шаблоны запросов по workspace+роли | **Backend готов** | `GET /api/v1/templates?workspace_id=`, `POST /templates/{id}/run`. |
| История запросов (агрегированная) | **Backend частично** | `GET /api/v1/history?workspace_id=` — **другая форма**, чем ожидает текущий frontend (см. §4). |
| Corrections (admin) | **Backend готов** | `GET/POST /api/v1/admin/corrections`. |
| Health | **Готов** | `GET /health`, `GET /api/v1/health`. |

---

## 3. Mock, fallback, demo-only (где «не прод»)

| Механизм | Где | Назначение |
|----------|-----|------------|
| `NEXT_PUBLIC_API_MOCK` / `fallback`, `NEXT_PUBLIC_DEMO_MODE` | `frontend/lib/api/config.ts` | Клиентские моки при отсутствии сети или 5xx. |
| `shouldForceAnalyticsMock()` | Тот же модуль + `cells.ts` | Принудительный mock для `/analytics/run` в демо-профиле. |
| `MOCK_NOTEBOOK_CELLS` в `analytics_pipeline` | Backend | In-memory накопление ячеек для сценария без БД-ноутбука (ограниченный контекст). |
| `mock_mode` в `SQLExecutionService` | Backend | Stub-строки вместо PostgreSQL при `MOCK_MODE=true`. |
| `mockList*`, `mockGet*` | `frontend/lib/api/mocks/index.ts` | Данные для списков/деталей при mock/fallback. |
| Локальные PDF-снимки отчётов | `frontend/lib/reports/local-snapshots.ts` | Оффлайн/fallback для PDF. |
| Детерминированный fallback в notebook UI | `useDeterministicFallback`, `lib/demo/seeded-data.ts` | Таблица/график при пустом legacy-map или демо-сценарии. |
| `Run all` ячеек в UI | `page.tsx` | Упрощённая симуляция последовательного «успеха», не полноценный engine. |
| `GET /api/v1/meta/dictionary` | Backend | **Статичный** ответ (один термин), не CRUD-словарь. |

---

## 4. Frontend: маршруты и функциональная полнота

| Route | Подключение | Зрелость |
|-------|----------------|----------|
| `/login`, `/register` | Auth API | Высокая. |
| `/demo-router` | Навигация | Хаб демо. |
| `/notebooks`, `/notebooks/[id]` | Notebooks + **analytics/run** (или mock) | **Ядро продукта**; trace/chart зависят от ответа API. |
| `/dashboard/*` | Частично mock-карточки (`lib/dashboard/mock-data`) | KPI **демо-уровень**; комментарии в UI про «после готовности backend». |
| `/reports` | `useSavedReports` и др. → пути **частично не совпадают** с backend (см. §5) | Часто **mock/fallback** для `scenarios`, `rerun` может отличаться. |
| `/history` | Ожидает `/history/notebook-runs`, `/history/queries` | **Нет** таких маршрутов в FastAPI → mock или ошибка без fallback. |
| `/templates` | Ожидает `/templates/queries`, `/templates/notebooks` | Backend: **`/templates` + workspace_id**, run **`/{id}/run`** — **несовпадение путей**. |
| `/dictionary` | Ожидает `/dictionary/entries` | Backend только **`/meta/dictionary`** — **несовпадение**. |
| `/data-upload` | `/api/v1/data/*` | Высокая совместимость с backend. |
| `/forecast-lab` | `useForecast` → `/forecast/*` | В целом совпадает с `data_layer` forecast router. |
| `/settings` | В основном клиентские преференсы / тексты | Не полноценный remote config. |

---

## 5. Backend: реально существующие endpoints (префикс `/api/v1`)

Сводка по `app/api/router.py` и роутам:

| Router | Prefix | Готовность |
|--------|--------|------------|
| health | `/health` | Да |
| auth | `/auth` | Да |
| notebooks | `/notebooks` | Да |
| dashboards | `/dashboards` | Да (`suggest`, `POST`) |
| analytics | `/analytics` | Да (`POST /run`) |
| data | `/data` | Да (upload, import, default-source, link-upload) |
| forecast | `/forecast` | Да |
| meta | `/meta` | Стаб: `GET /dictionary` |
| admin_corrections | `/admin/corrections` | Да |
| reports | `/reports` | Да (нет отдельного **`GET /reports/scenarios`** в коде) |
| templates | `/templates` | Да (query `workspace_id`, run `POST /{template_id}/run`) |
| history | `/history` | **Только** `GET ""` с **`workspace_id`** |

**Критичные контрактные разрывы (frontend → backend):**

1. **История:** клиент — `/history/notebook-runs`, `/history/queries`, `rerun`, `save-report`; сервер — один `GET /history?workspace_id=`.
2. **Шаблоны:** клиент — `/templates/queries`, `/templates/notebooks`, run на `/templates/queries/{id}/run`; сервер — `/templates?workspace_id=`, `POST /templates/{template_id}/run`.
3. **Словарь:** клиент — CRUD `/dictionary/entries`; сервер — только `GET /meta/dictionary`.
4. **Расписания:** клиент — `/schedules` (глобальный ресурс); сервер — **schedule привязан к отчёту** `POST|PATCH|DELETE /reports/{id}/schedule`.

---

## 6. Данные и таблицы

| Источник | Использование |
|----------|----------------|
| `public.anonymized_incity_orders` (и `settings.ds_default_source_table`) | Основной факт-таблица NL→SQL, DS, bootstrap SQL. |
| `user_staging.*` (после CSV import) | Whitelist + `DataImportJob.transform_config_json.qualified_table`; подстановка в notebook context как `source_table`. |
| Продуктовые таблицы | `notebooks`, `notebook_cells`, `cell_runs`, `saved_reports`, `report_schedules`, `query_templates`, `query_corrections`, `data_import_jobs`, `forecast_runs`, и т.д. (см. README §9, Alembic baseline). |

Качество рядов для прогноза документировано в README (distinct orders, cancellations, caps, backtest metadata) — это относится к **DS-слою**, не к ad-hoc SQL notebook.

---

## 7. NL → SQL pipeline (текущая архитектура)

Упорядоченный поток (см. `QueryOrchestrator.run`, README §8):

1. **Preprocessor** — нормализация строки запроса.  
2. **Dialogue** — follow-up, наследование контекста (`DialogueContextEngine`).  
3. **Intent** — правила + опционально LLM (`IntentService`); сущности (`extract_entities`).  
4. **Semantic resolution** — словарь паттернов → `term_key` + SQL-фрагмент (`SemanticService`).  
5. **Clarification** — ветвление «нужно уточнение?», confidence (`ClarificationEngine`).  
6. **SQL generation** — шаблоны по intent + `metric_sql` + `source_table` (`SQLGenerationService`).  
7. **Correction learning** (опционально, при `db_session` + workspace).  
8. **Validation** — `SQLValidatorService` (whitelist таблиц/колонок, запрет опасных конструкций).  
9. **Execution** — PostgreSQL или mock (`SQLExecutionService`).  
10. **Chart recommendation** — правила (`ChartRecommendationService`).  
11. **Insight** — LLM + детерминированный fallback (`InsightGenerationService`).  
12. **Forecast sidecar** — для intent forecast / ключевых слов (`_forecast_from_rows`).  
13. **Trace payload** — шаги, SQL, clarification, `build_explainability_trace_v1` для API.

Ранее: опциональная подмена числовых `city_id` на подписи через env — **удалена**; в UI остаются значения из результата SQL.

Семантика **зашита в код** (`SemanticService.TERMS`) — это MVP semantic layer, а не отдельная БД-таблица терминов для runtime NL→SQL.

---

## 8. Semantic layer / dictionary / templates / reports / history / schedules

| Компонент | Реализация | Заметка |
|-----------|-------------|---------|
| **Semantic layer (runtime NL→SQL)** | `SemanticService` в коде | Расширяется паттернами + тестами. |
| **Dictionary (продуктовый UI)** | Frontend ожидает REST; backend — заглушка `meta/dictionary` | Нужна **сшивка** или честный «read-only из SemanticService» без фейкового CRUD. |
| **Templates** | Таблица + API `GET/POST .../templates` | Пути и query-параметры **не совпадают** с `lib/api/templates.ts`. |
| **Reports + schedule** | Полноценный CRUD вокруг `saved_reports` | Согласован с частью frontend; **нет** `GET /reports/scenarios` на сервере. |
| **History** | Сервис `list_query_history` | **Не** совпадает с ожиданиями History UI. |
| **Глобальные schedules** | Не реализованы как `/schedules` | Есть только **per-report** schedule. |

---

## 9. Слабые места (security, performance, UX, data quality, explainability)

### Security

- SQL **whitelist** таблиц/колонок — сильный MVP-guardrail; риск: **regex извлечения таблиц** из SQL не покрывает все кавычки/алиасы; staging с нестандартными именами может упроститься до default table в генераторе.  
- Роли на SQL-validation: передаётся `role_key`, глубина проверки — убедиться в тестах на запрет DDL/DML.  
- Секреты LLM только через env; логирование без ключей — ок, контролировать новые логи.

### Performance

- Тяжёлые запросы: `SQL_DEFAULT_LIMIT`, `statement_timeout` — хорошо; большие CSV и forecast — риск по памяти/времени; мониторить на демо-наборе.  
- Несколько LLM-вызовов за один run — клиентский timeout 45s; при медленной сети возможны обрывы.

### UX

- Дублирование текста ошибок (`message` + `body`) при 500.  
- Непонятность **live vs mock** для ревьюера — добавить явный индикатор режима данных/API.  
- Dashboard заявляет placeholder — снизить ожидания или подключить реальные агрегаты.

### Data quality

- Staging vs default table — логика «последний успешный импорт» best-effort; при сбое БД — fallback (уже с логами).  
- DS-метрики: winsorization/caps — см. README; ad-hoc SQL в notebook **не** проходит те же caps автоматически.

### Explainability

- Backend trace v1 обогащён (`forecast_selection`, `quality_gate`, таблицы из SQL).  
- UI `TracePanel` / типы TS могут **отставать** от контракта — снизить ценность демо, если не синхронизировать.

---

## 10. Gaps — краткая таблица

| ID | Gap | Риск для оценки |
|----|-----|------------------|
| G1 | Несовпадение History API ↔ UI | «История не работает» без mock |
| G2 | Несовпадение Templates API ↔ UI | Шаблоны всегда mock |
| G3 | Нет REST dictionary как на фронте | Словарь — mock или 404 |
| G4 | Нет `GET /reports/scenarios` | Сценарии на странице отчётов — mock |
| G5 | Schedules: глобальный `/schedules` vs per-report | Путаница в демо |
| G6 | Trace UI vs schema | Explainability слабее, чем backend |
| G7 | Dashboard vs реальные KPI | Меньше «business value» визуально |

---

## 11. Приоритеты (MoSCoW для MVP-защиты)

**Must**

- P1: Выровнять **History** (либо добавить backend-роуты под текущий клиент, либо сменить клиент на `GET /history?workspace_id=` + маппинг DTO) — доверие к «истории запросов».  
- P2: Выровнять **Templates** client paths с `/templates` + `workspace_id`.  
- P3: **Словарь**: минимум read-only endpoint совместимый с UI или сужение UI до `meta/dictionary` + честная подпись «MVP stub».  
- P4: Единый **индикатор режима** (live / mock / fallback) + менее дублирующиеся ошибки analytics.

**Should**

- P5: `GET /reports/scenarios` или удаление вызова с фронта в пользу данных из `notebooks` API.  
- P6: Синхронизация **TracePanel** с `AnalyticsExplainabilityTraceV1`.  
- P7: Golden-тесты NL→SQL (русские фразы из `docs/demo-script.md`).

**Could**

- P8: Dashboard виджеты из простых агрегатных SQL (без новой архитектуры).  
- P9: Документ «contract matrix» frontend path ↔ OpenAPI.

**Won’t (для текущего MVP-спринта)**

- Новый движок SQL из NL с нуля, multi-tenant isolation enterprise-уровня, отдельный OLAP.

---

## 12. Последовательность улучшений (фазы)

### Фаза 0 — Зафиксировано в коде/ветке (ориентир)

- Устойчивость trace (`confidence`), порядок интентов ranking/geo, подписи `city_id`, DS quality metadata, proxy same-origin — уже движение в сторону P4/P7.

### Фаза 1 — Контракты API (1–2 недели эволюции маленькими PR)

1. History: **один** источник правды (правка клиента быстрее, чем плодить 4 endpoint без моделей).  
2. Templates: параметр `workspace_id` + пути `GET /templates`, `POST /templates/{id}/run`.  
3. Dictionary: `GET` совместимый с UI или упрощение UI + README.

### Фаза 2 — Доверие и explainability

4. Trace UI parity + короткие тексты «что выбралось и почему».  
5. Отчёты: `scenarios` из API или из notebooks list.  
6. Schedules: переименовать/перенаправить клиент на report-scoped API **или** тонкий адаптер `GET /schedules` поверх `report_schedules`.

### Фаза 3 — Качество NL→SQL и демо

7. Golden-тесты + расширение `SemanticService` по провалам.  
8. Dashboard: 1–2 реальных виджета на агрегатах из whitelist.

### Фаза 4 — Hardening

9. Негативные security-тесты SQL; лимиты на размер ответа trace; метрики времени шага pipeline в trace (опционально).

---

## 13. Как проверить локально (после изменений фазы)

```bash
# Backend
cd backend && python3 -m pytest tests -q
# или в Docker
make ds-quality

# Frontend
cd frontend && npm run lint && npm run build
```

Ручной сценарий «защита демо»:

1. Поднять stack (см. `DOCKER.md` / `Makefile`), выставить `MOCK_MODE=false`, валидный `DATABASE_URL`.  
2. Залогиниться → **Notebooks** → промпт из `docs/demo-script.md` → убедиться в SQL + trace.  
3. **Reports**: создать отчёт, назначить расписание, скачать PDF.  
4. **Templates / History / Dictionary**: проверить в **live** режиме (`NEXT_PUBLIC_API_MOCK=0`), что нет скрытого mock из-за 404.

---

## 14. Владение документом

Этот файл — **живой roadmap**: после каждой фазы обновлять §10–§12 (закрытые gaps, новые риски) и ссылку на PR/коммит. Не дублировать полный OpenAPI здесь — достаточно ссылаться на `README.md` (NL→SQL, guardrails, ограничения MVP) и исходники роутеров в `backend/app/api/routes/`.

## 15. Финальная упаковка репозитория (ориентир)

Для презентации и онбординга зафиксированы:

- **`README.md`** — что умеет MVP, сценарии, pipeline, guardrails, semantic layer, clarification/confidence, отчёты/шаблоны, запуск, **ограничения MVP**, критерии оценки, примеры, **roadmap после MVP**;
- **`docs/architecture.md`** — mermaid-схема и слой оркестрации;
- **`docs/demo-script.md`** — пошаговый демо-сценарий с учётом объёмного seed;
- **`docs/demo-analytics-dataset.md`** — описание демо-датасета.

Стратегический **roadmap после релиза MVP** (продукт + платформа) вынесен в **`README.md` §26**; этот документ остаётся каноном по **инженерным разрывам** и фазам 0–4 выше.
