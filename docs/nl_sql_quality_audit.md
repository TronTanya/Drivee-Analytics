# Аудит NL→SQL pipeline (Drivee Analytics Notebook)

## Текущий pipeline (кратко)

1. **Вход:** `POST /api/v1/analytics/run` → `run_pipeline_with_analysis` → `analyze_natural_language`.
2. **Intent:** `IntentService.classify_intent` (правила + опционально LLM `interpret_user_query`).
3. **Сущности:** `IntentService.extract_entities` + контекст ноутбука / диалога.
4. **Семантика и время:** `SemanticParser.build` → `NLQueryInterpretation` + патч в `entities` (`time_period`, `calendar_year`, `dimensions`, …).
5. **Метрика:** `SemanticService.resolve_with_hint` → `SemanticTermResolution` + `canonical_metric_key` в `entities`.
6. **SQL:** `SQLGenerationService.generate` по `intent` + `entities` + SQL-фрагмент метрики.
7. **Валидация:** `SQLExecutionService.validate` → `SQLValidatorService` / `sql_trust`.
8. **Исполнение:** `SQLExecutionService.execute` (или mock / fallback).
9. **График / инсайт / прогноз:** `ChartRecommendationService`, `InsightGenerationService`, baseline forecast.
10. **Trace:** `OrchestrationOutput.trace_payload` + `build_explainability_trace_v1` → ячейка `trace` в notebook (`analytics_pipeline._result_to_pipeline_cells`).

## Где что происходит (файлы)

| Этап | Основные модули |
|------|------------------|
| Intent detection | `app/services/orchestration/intent_service.py` |
| Semantic parsing | `app/services/orchestration/semantic_parser.py`, `semantic_service.py` |
| Metric mapping | `app/services/semantic_layer/store.py` + `app/data/semantic_dictionary.json` |
| Dimensions | `semantic_parser.py` (`dimensions`), `entities["dimensions"]` |
| Time range | `semantic_parser.py` → `TimeRangeSpec` → `entity_patch` → `sql_generation_service._build_time_filter` |
| SQL generation | `app/services/orchestration/sql_generation_service.py` |
| SQL validation | `app/services/sql_validation/*`, вызов из `sql_execution_service.py` |
| Confidence | оркестратор + `NLQueryInterpretation.confidence_score` / band; в ответе `OrchestrationOutput.confidence_score` |
| Clarification | `clarification_engine.py` → `ClarificationResponse` |
| Chart type | `chart_recommendation_service.py` + `VisualizationRecommendation` |
| Explainability trace | `explainability_service.py`, `schemas/trace_payload.py`, сборка в `query_orchestrator.py` и `analytics_pipeline.py` |

## Что уже было до улучшения

- Жёсткий whitelist таблиц/колонок, лимиты SQL, аудит событий.
- Структурированный trace v1 для UI (`AnalyticsExplainabilityTraceV1`).
- Регрессионные тесты NL (golden defense), orchestration, sql_trust.

## Чего не хватало

- Единого **golden-набора** бизнес-промптов с ожидаемыми intent/metric/временем в репозитории.
- **Автоматического прогона** сравнения «ожидание vs факт» и агрегированных метрик качества.
- **HTTP API** и **демо-страницы** для жюри без ручного чтения pytest.
- Явного **короткого слоя** «interpretation + шаги pipeline» в payload trace для презентаций.

## Что добавлено (реализация)

| Компонент | Файлы |
|-----------|--------|
| Golden dataset | `backend/app/evals/golden/nl_sql_golden_cases.json` |
| Evaluation engine | `backend/app/services/evaluation/nl_sql_evaluator.py` |
| API | `backend/app/api/routes/evaluation_nl_sql.py`, подключение в `app/api/router.py` |
| Схемы ответов | `backend/app/schemas/evaluation_nl_sql.py` |
| Тесты | `backend/tests/evaluation/test_nl_sql_evaluator.py`, `backend/tests/api/test_evaluation_api.py` |
| UI Quality Center | `frontend/app/(platform)/quality/page.tsx`, `frontend/lib/api/evaluation.ts` |
| Trace enrichment | `query_orchestrator.py` — `interpretation` + `trace` в `trace_payload`; `analytics_pipeline.py` — те же поля в payload ячейки trace |
| Документация жюри | `docs/jury_nl_sql_quality_pitch.md`, раздел в `README.md` |

## API для жюри

- `GET /api/v1/evaluation/nl-sql/summary` — последняя сводка или быстрый mock.
- `GET /api/v1/evaluation/nl-sql/cases` — список golden-кейсов (без лишних внутренностей).
- `POST /api/v1/evaluation/nl-sql/run` — полный прогон suite + результаты по кейсам.

Доступ: авторизованный пользователь (демо JWT). В production при необходимости ограничьте ролью `admin` в роутере.

## Как показать жюри

1. Запустить stack (`docker compose up`).
2. Войти как manager (или admin).
3. Открыть **NL→SQL Quality** (`/quality`) из навигации или карточки на dashboard manager.
4. Нажать **Run evaluation** — увидеть метрики и таблицу кейсов.
5. Открыть кейс — expected vs actual, SQL, checks, trace.

Команда CI/backend: `make test-nl-sql-quality`.
