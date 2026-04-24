# Drivee Analytics Notebook — технический аудит (Cursor)

**Дата:** 2026-04-24  
**Цель:** защита хакатона / жюри-критерии (бизнес-ценность, E2E MVP, NL→SQL, SQL correctness, guardrails, UX/trace, DS/forecast, Quality Center).

---

## 1. Что уже реализовано (сильные стороны)

### Backend — оркестрация и NL→SQL
- **End-to-end pipeline** в [`backend/app/services/orchestration/query_orchestrator.py`](../backend/app/services/orchestration/query_orchestrator.py): препроцессинг, диалоговый контекст, intent/entities, semantic parse, policy guardrails, clarification, генерация SQL, валидация, выполнение, chart/insight, forecast sidecar, trace/audit.
- **Rules-first NL→SQL** в [`intent_service.py`](../backend/app/services/orchestration/intent_service.py), [`semantic_parser.py`](../backend/app/services/orchestration/semantic_parser.py), [`sql_generation_service.py`](../backend/app/services/orchestration/sql_generation_service.py): устойчивость к демо без «свободного LLM-SQL».
- **Clarification** в [`clarification_engine.py`](../backend/app/services/orchestration/clarification_engine.py) + [`dialogue_context_engine.py`](../backend/app/services/orchestration/dialogue_context_engine.py): follow-up, confidence, уточняющие вопросы.
- **Semantic layer** в [`backend/app/services/semantic_layer/store.py`](../backend/app/services/semantic_layer/store.py) + API словаря [`dictionary.py`](../backend/app/api/routes/dictionary.py).

### Backend — безопасность SQL и guardrails
- **SQL validation** [`validator_service.py`](../backend/app/services/sql_validation/validator_service.py), эвристики доверия [`sql_trust.py`](../backend/app/services/sql_validation/sql_trust.py), константы [`core/sql_validation_constants.py`](../backend/app/core/sql_validation_constants.py).
- **NL guardrails** [`policy_engine.py`](../backend/app/services/guardrails/policy_engine.py) + константы [`core/guardrails_constants.py`](../backend/app/core/guardrails_constants.py).
- **Админская политика SQL** (whitelist extras + лимит строк) [`admin_sql_policy.py`](../backend/app/api/routes/admin_sql_policy.py) + [`effective_sql_settings.py`](../backend/app/services/sql_validation/effective_sql_settings.py).

### Backend — DS / forecast
- **Baseline forecast** [`baseline_forecast.py`](../backend/app/services/ds/baseline_forecast.py), DS сервисы [`forecasting_service.py`](../backend/app/services/ds/forecasting_service.py), API data/forecast [`data_layer.py`](../backend/app/api/routes/data_layer.py).

### Backend — Quality / evaluation
- **Quality Center + suites** [`evaluation_drivee_quality.py`](../backend/app/api/routes/evaluation_drivee_quality.py), сервисы в [`services/evaluation/`](../backend/app/services/evaluation/).

### Frontend — продуктовый UX
- **Notebook** [`frontend/app/(platform)/notebooks/[id]/page.tsx`](../frontend/app/(platform)/notebooks/[id]/page.tsx): prompt, run, trace, SQL, table, chart, insight, forecast, сохранение сценария/отчёта.
- **Trace UI** [`trace-panel.tsx`](../frontend/components/notebook/trace-panel.tsx).
- **Quality Center UI** [`quality/page.tsx`](../frontend/app/(platform)/quality/page.tsx).
- **Навигация по ролям** [`navigation/config.ts`](../frontend/lib/navigation/config.ts) + shell [`platform-shell.tsx`](../frontend/components/platform/platform-shell.tsx).

### DevOps
- **Docker Compose** с миграциями, сидом, импортом train, healthcheck backend, зависимость frontend→backend healthy.
- **Makefile** с smoke/NL/guardrails/orchestration/e2e целями.

---

## 2. Что работает как mock / fallback (явно отмечать в демо)

| Зона | Поведение | Где |
|------|-----------|-----|
| SQL execution | `mock_mode` / `mock_sql_execution_fallback` | `sql_execution_service.py`, `core/config.py` |
| LLM | отключение при отсутствии ключа / провайдера | `llm/factory.py` |
| Insight / explainability | детерминированные тексты при недоступности LLM | `insight_generation_service.py`, `explainability_service.py` |
| Demo auth | bypass в dev/demo/local/test | `auth/dependencies.py` |
| Evaluation | mock/deterministic режим suite | `evaluation/base_evaluator.py` |
| Chart | fallback на table при несовместимых данных | `analytics_pipeline.py`, chart enrich |

**Риск для жюри:** если не проговорить режим, демо может выглядеть как «всегда успех» при stub/fallback.

---

## 3. Где можно сломать live demo

1. **Долгий `POST /api/v1/analytics/run`** (LLM + SQL + Postgres) — при same-origin Next proxy возможны таймауты; нужен прямой `NEXT_PUBLIC_API_URL` на backend или увеличение таймаутов клиента.
2. **Старт backend** — цепочка wait + alembic + seed + import CSV; frontend не должен стартовать до healthy backend (уже в compose).
3. **Жёсткий bind CSV** в compose на хост-путь — на чужой машине импорт падает; нужен override через env.
4. **E2E baseURL** Playwright по умолчанию 3000 vs compose 3001 — без `PLAYWRIGHT_BASE_URL` прогоны красные.
5. **Semantic dictionary drift** — правки через API без процедуры ревью могут сломать резолв метрик.

---

## 4. Слабые места по критериям жюри (и что усиливаем)

| Критерий | Слабое место | Усиление в рамках плана |
|----------|--------------|-------------------------|
| NL→SQL точность | Ограниченный recall на «свободной» русской формулировке | Golden suite из 10 запросов + clarification для ambiguity |
| SQL safety | Regex/heuristics, не полный SQL parser | Централизованный `sql_safety` + тесты инъекций |
| Role guardrails | В основном NL/SQL слой + UI hide | `role_policy` + enforcement на ключевых API |
| Explainability | Trace богатый, но не всегда «жюри-narrative» | Расширение trace + русские summary блоки |
| UX manager | Дашборд функциональный, мало «story» | KPI + workflow + Quality Center entry |
| Quality Center | Скрыт из основного пути ранее | Вернуть entry для manager + pitch doc |
| Demo ops | Разрозненные команды/порты | `make demo-live` + runbook |

---

## 5. Какие файлы менять (приоритетный список)

**Backend:**  
`query_orchestrator.py`, `intent_service.py`, `clarification_engine.py`, `sql_generation_service.py`, `validator_service.py` / новый `services/security/sql_safety.py`, новый `guardrails/role_policy.py`, `schemas/trace_payload.py`, `chart_recommendation_service.py`, `ds/baseline_forecast.py` или новый `forecast_service.py`, новый `api/routes/quality_summary.py`, `api/router.py`.

**Frontend:**  
`notebooks/[id]/page.tsx`, `trace-panel.tsx`, `dashboard/manager/page.tsx`, при необходимости `chart-*` компоненты.

**Tests:**  
`backend/tests/golden/test_nl_to_sql_golden_cases.py`, `backend/tests/security/test_sql_injection.py`, `backend/tests/sql_validation/test_sql_safety.py`, `backend/tests/guardrails/test_role_policy.py`, `backend/tests/orchestration/test_chart_recommendation.py`, `backend/tests/ds/test_forecast_service.py`.

**Docs / Ops:**  
`docs/DEMO_LIVE_RUNBOOK.md`, `docs/QUALITY_CENTER_PITCH.md`, `docs/JURY_QA.md`, `docs/FINAL_DEMO_SCRIPT.md`, `docs/TESTING_GUIDE.md`, `Makefile`, `docker-compose.yml`, `frontend/package.json`.

---

## 6. Этапы внедрения (как выполняется план)

1. **Аудит** — этот документ.  
2. **Demo-live** — `make demo-live`, runbook, опциональный путь к train CSV.  
3. **NL→SQL** — 10 русских кейсов + golden tests + ambiguity «эффективность каналов».  
4. **SQL safety** — модуль + интеграция в validator path + security тесты.  
5. **Role policy** — централизованные действия + API checks + тесты.  
6. **Trace** — поля narrative + UI.  
7. **Charts** — recommendation contract + тесты.  
8. **Forecast** — явный baseline disclaimer в trace + сервисный слой + тесты.  
9. **Quality Center** — `GET /api/v1/quality/summary` + manager entry + pitch.  
10. **Manager UI** — KPI, workflow, quick prompts.  
11. **Jury docs** — Q&A + demo script.  
12. **Testing** — make targets + strict e2e script + testing guide.  
13. **Регрессия** — прогон ключевых pytest + lint + e2e quick.

---

*Документ живой: после внедрения этапов обновлять разделы 1–3 фактическими командами и метриками прогона.*
