# Drivee Quality Center — аудит архитектуры и план расширения

Дата: 2026-04-24. Цель: зафиксировать **текущее состояние** NL→SQL и смежных систем, **пробелы** относительно конкурентного «eval-first» подхода (без превращения продукта в SQL IDE) и **какие модули/API** добавят **Drivee Quality Center** как доказательство качества для жюри.

Позиционирование: **Drivee Analytics Notebook** — бизнесовый AI analytics notebook с ролями, explainability, guardrails, отчётами, расписанием и forecast; Quality Center — **измеримость** и **регрессия** качества, а не замена notebook UX.

---

## 1. NL→SQL pipeline — где что происходит

| Этап | Основные модули |
|------|-----------------|
| Препроцессинг | `IntentService.preprocess_query` (вызов из `QueryOrchestrator`) |
| Follow-up / контекст диалога | `DialogueContextEngine` — `backend/app/services/orchestration/dialogue_context_engine.py` |
| Intent detection | `IntentService` — `backend/app/services/orchestration/intent_service.py` (правила + опционально LLM) |
| Semantic parsing (периоды, измерения, патч entities) | `SemanticParser` — `backend/app/services/orchestration/semantic_parser.py` |
| Metric mapping / semantic terms | `SemanticService` + `SemanticDictionaryStore` — `semantic_service.py`, `semantic_layer/store.py`, данные `backend/app/data/semantic_dictionary.json` |
| Dimension mapping | `SemanticParser` + `entities["dimensions"]`, словарь |
| Time range parsing | `SemanticParser` → `TimeRangeSpec` / `entities` (`time_period`, `window_days`, `calendar_year`, …) |
| Clarification | `ClarificationEngine` — `backend/app/services/orchestration/clarification_engine.py` |
| SQL generation | `SQLGenerationService` — `backend/app/services/orchestration/sql_generation_service.py` |
| SQL validation | `SQLValidatorService`, `sql_trust` — `backend/app/services/sql_validation/*` |
| Execution | `SQLExecutionService` — `backend/app/services/orchestration/sql_execution_service.py` |
| Chart recommendation | `ChartRecommendationService` — `chart_recommendation_service.py` |
| Insight / forecast | `InsightGenerationService`, forecast sidecar в оркестраторе / pipeline |
| Trace | сборка в `QueryOrchestrator`, `analytics_pipeline`, схемы trace, UI: `trace-panel.tsx` |
| Confidence | оркестратор + `NLQueryInterpretation` / ответ аналитики |
| Точка входа API для notebook | `POST /api/v1/analytics/run` — `backend/app/api/routes/analytics.py` → `run_pipeline_with_analysis` / `analyze_natural_language` |

Подробная схема: `docs/architecture.md`, контракты: `docs/domain-contracts-and-runtime-modes.md`.

---

## 2. Где лежат ключевые компоненты

| Компонент | Расположение |
|-----------|----------------|
| Semantic dictionary (JSON + API) | `backend/app/data/semantic_dictionary.json`, `backend/app/services/semantic_layer/store.py`, `backend/app/api/routes/dictionary.py` |
| Шаблоны запросов | `query_templates`, API `templates_api.py` |
| Guardrails / role metrics | `backend/app/core/guardrails_constants.py`, `policy_engine.py`, интеграция в `query_orchestrator.py` |
| SQL validator | `backend/app/services/sql_validation/validator_service.py`, `sql_trust.py`, `utils.py` |
| Query executor | `SQLExecutionService` |
| Frontend API client | `frontend/lib/api/*.ts`, в т.ч. `client.ts`, `evaluation.ts` |
| Notebook UI | `frontend/app/(platform)/notebooks/*`, `frontend/components/notebook/*` |
| Dashboard UI | `frontend/app/(platform)/dashboard/*` |
| Reports / schedules | `backend/app/api/routes/reports.py`, модели/сервисы отчётов |
| Тесты orchestration / guardrails | `backend/tests/orchestration`, `backend/tests/guardrails`, `backend/tests/evaluation`, `backend/tests/api` |
| Docker | `docker-compose.yml`, `DOCKER.md` |
| Миграции / seed | `backend/sql/`, `backend/scripts/seed_demo_data.py`, alembic |

---

## 3. Что уже есть (релевантно Quality Center)

- **Golden NL→SQL suite** (`nl_sql_golden_cases.json` + `nl_sql_evaluator.py` + API `/evaluation/nl-sql/*`) — intent, metric, dimensions, time, chart, clarification, guardrail, substring SQL checks, mock/deterministic/live через `analyze_natural_language`.
- **SQL Correctness suite (v1)** — `sql_correctness_cases.json`, детерминированный путь без внешнего LLM, валидация через `SQLValidatorService`, опционально live scalar compare, API `/evaluation/sql-correctness/*`.
- **UI `/quality`** — `frontend/app/(platform)/quality/page.tsx` (NL + SQL correctness блоки, demo fallback).
- **Trace / quality gate в продукте** — `trace-panel.tsx`, `trace-model.ts`, `docs/ds-quality-spec.md`.
- **Документация жюри** — `docs/jury-demo-runbook.md`, README раздел про golden evaluation.

---

## 4. Чего не хватает (gap vs целевой Quality Center)

1. **Единая витрина** «Drivee Quality Center» с вкладками: Understanding / SQL / Visualization / Guardrails / Repair Brief / Prompt Stability — сейчас страница частично NL+SQL, без агрегированного overall score и без repair/stability UI.
2. **Отдельные golden datasets** под understanding (с `confidence_min`, `context` для follow-up), visualization match, guardrails-only — частично пересекается с `nl_sql_golden_cases.json`, но целевая структура шире.
3. **Расширенный SQL correctness** — проверки таблиц/колонок/result shape/агрегаций поверх фрагментов; крупный набор кейсов (25+).
4. **QualityCenterService** — один ответ со сводкой по всем suites + `overall_quality_score`.
5. **Repair Brief** — артефакты прогона (`evals/runs/...`), кластеризация причин, markdown для жюри/разработки.
6. **Prompt stability** — N прогонов одного промпта, API + CLI.
7. **Fail-under threshold** — единый CLI `run_quality_evals.py` с exit code 1.
8. **REST surface** — маршруты вида `/evaluation/quality/*`, `/evaluation/understanding/*`, `/evaluation/visualization/*`, `/evaluation/guardrails/*`, `/evaluation/prompt-stability` (в проекте исторически `routes/`, не `api/v1/evaluation.py` — адаптация без ломания префикса `/api/v1`).
9. **Schema-grounded clarification** для размытых прилагательных («лучшие», «плохие», …) — частично есть опции в `ClarificationEngine`, нужно усилить покрытие и trace-шаг `clarification_policy`.
10. **Follow-up trace** — наследование для notebook cells («топ-5») — `DialogueContextEngine` умеет follow-up shape; нужно явные trace steps `context_inheritance` и тесты на golden chains.

---

## 5. Какие модули будут добавлены / расширены

| Модуль | Назначение |
|--------|------------|
| `backend/app/evals/golden/nl_sql_understanding_cases.json` | Golden understanding (30+), follow-up chains, clarification, guardrail |
| `backend/app/evals/golden/sql_correctness_cases.json` | Расширение до 25+ кейсов, богатый `expected` |
| `backend/app/evals/golden/visualization_match_cases.json` | Chart / оси / result_shape |
| `backend/app/evals/golden/guardrails_safety_cases.json` | Только safety/guardrail сценарии |
| `backend/app/evals/runs/<timestamp>/` | Артефакты прогона (json + md) |
| `backend/app/services/evaluation/base_evaluator.py` | Общие утилиты: load JSON, modes, trace formatting |
| `backend/app/services/evaluation/nl_sql_understanding_evaluator.py` | Suite Understanding |
| Расширение `sql_correctness_evaluator.py` | Доп. checks: tables/columns/shape где возможно детерминированно |
| `visualization_match_evaluator.py`, `guardrails_safety_evaluator.py` | Новые suites |
| `quality_center_service.py` | Агрегация summaries + overall score |
| `repair_brief_service.py` | Кластеры падений + `repair_brief.md` |
| `backend/scripts/debug_prompt_stability.py` | CLI stability |
| `backend/scripts/run_quality_evals.py` | CLI `--fail-under` |
| `backend/app/api/routes/evaluation_*.py` | Новые/расширенные роутеры, регистрация в `router.py` |
| `frontend/app/(platform)/quality/page.tsx` | Полноценный Quality Center (вкладки; маршрут остаётся `/quality`) |
| `frontend/lib/api/evaluation.ts`, `types/api/evaluation.ts` | Новые вызовы API |
| `clarification_engine.py`, `dialogue_context_engine.py`, `query_orchestrator.py` | Усиление clarification + trace наследования |
| `docs/evaluation_guide.md`, `docs/jury_quality_center_pitch.md` | Гайд для жюри и питч |
| `README.md` | Раздел Drivee Quality Center |

**Примечание:** файл `backend/app/api/v1/evaluation.py` в репозитории **не используется** — принят паттерн `app/api/routes/*.py` + `include_router` в `app/api/router.py`. Новые endpoints будут добавлены **там же**, с префиксом `/api/v1/evaluation/...`.

---

## 6. Какие API будут добавлены

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/api/v1/evaluation/quality/summary` | Последняя сводка Quality Center |
| POST | `/api/v1/evaluation/quality/run` | Прогон всех suites (режим в body) |
| GET/POST | `/api/v1/evaluation/understanding/{summary,cases,run}` | Understanding suite |
| GET/POST | `/api/v1/evaluation/sql-correctness/*` | Уже есть — сохранить/расширить при необходимости |
| GET/POST | `/api/v1/evaluation/visualization/*` | Visualization suite |
| GET/POST | `/api/v1/evaluation/guardrails/*` | Guardrails suite |
| POST | `/api/v1/evaluation/prompt-stability` | Stability debug |

Авторизация: как у текущих evaluation routes — `get_current_active_user` (demo JWT не ломаем).

---

## 7. Усиление критериев жюри

| Критерий жюри | Как помогает Quality Center |
|----------------|-----------------------------|
| Точность NL→SQL | Understanding suite + follow-up + confidence_min; сравнение expected vs actual в UI |
| Корректность SQL | Расширенный SQL correctness + live scalar при полном train |
| Безопасность | Отдельный guardrails suite + существующий SQL validator/trace |
| UX / explainability | Case drawer: SQL, checks, trace; Repair Brief с рекомендациями |
| Качество демо | Deterministic режим без внешнего LLM; fail-under для CI; готовый pitch-док |

---

## 8. Риски и ограничения

- **LLM-зависимые кейсы** в `live`/`mock` с включённым LLM могут флапать — для жюри и CI опираться на `deterministic` и детерминированные подпути.
- **Result shape / columns** — без полноценного SQL AST в проекте проверки частично эвристические (regex/нормализация + execution в live).
- **Объём JSON** — большие файлы в git; допустимо для hackathon MVP.
- **Дублирование с `nl_sql_golden_cases.json`** — understanding может переиспользовать логику сравнения, но хранит отдельный датасет по ТЗ.

---

## 9. Implementation plan (кратко по этапам)

1. Golden JSONs (4 файла) + минимальные схемы Pydantic.  
2. Evaluators + `QualityCenterService` + `RepairBriefService`.  
3. Скрипты CLI + prompt stability API.  
4. FastAPI routes + тесты.  
5. Frontend Quality Center (вкладки, overall, repair, stability).  
6. Clarification + dialogue trace усиление + dashboard карточка + навигация.  
7. Документация + README.

После утверждения этого аудита реализация идёт по списку выше без удаления существующих сценариев demo-login, notebook, reports, schedules, docker-compose.
