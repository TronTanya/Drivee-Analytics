# Drivee Quality Center — руководство по evaluation

## 1. Что это

**Drivee Quality Center** — встроенный модуль измерения качества AI-аналитики вокруг существующего notebook-продукта: не SQL IDE, а **доказательная база** для NL→SQL, корректности SQL, согласованности визуализации и guardrails.

## 2. Suites

| Suite | Что проверяет |
|-------|----------------|
| **Understanding** | intent, metric, dimensions, time range, clarification, follow-up контекст, confidence |
| **SQL Correctness** | таблицы, колонки, фрагменты, агрегации, result shape, SQL validation, опционально live scalar |
| **Visualization Match** | chart type, оси/серии, эвристика result shape |
| **Guardrails & Safety** | блокировка опасного SQL, чувствительные данные, политики ролей |

Дополнительно:

- **Prompt Stability** — повторяемость исхода для одного и того же промпта (`POST /api/v1/evaluation/prompt-stability`).
- **Repair Brief** — markdown после полного прогона (`POST /api/v1/evaluation/quality/run`), файлы в `backend/app/evals/runs/<timestamp>/`.

## 3. Как запустить

### UI

1. Войти под демо-пользователем (например `manager@drivee.local` / `demo123`).
2. Открыть **`/quality`** (пункт навигации **Quality Center**).
3. Выбрать режим `deterministic` / `mock` / `live`.
4. Нажать **Run all evaluations** или прогнать отдельный suite на вкладке.

### API (префикс `/api/v1`)

- `GET /evaluation/quality/summary?mode=deterministic`
- `POST /evaluation/quality/run` — полный прогон + запись repair brief
- `GET /evaluation/quality/last-run-details?mode=deterministic` — последние case results по всем suite
- `GET /evaluation/quality/repair-brief/latest` — последний `repair_brief.md`
- Per-suite: `GET|POST /evaluation/understanding/...`, `.../visualization/...`, `.../guardrails/...`, SQL correctness остаётся на `.../sql-correctness/...`.

### CLI

```bash
make quality-eval
# или
python backend/scripts/run_quality_evals.py --suite all --mode deterministic --fail-under 0.85
```

Live (с оговорками по данным и LLM):

```bash
make quality-eval-live
```

Тесты:

```bash
pytest backend/tests/evaluation -q
```

## 4. Как читать summary

- **overall_quality_score** — среднее по четырём suite (0…1).
- По каждому suite: `passed_cases` / `total_cases`, `overall_accuracy`, в `extra.summary` — детальные поля legacy-сводок (intent/metric/…).

## 5. Как читать `repair_brief.md`

Файл создаётся только после **`POST /evaluation/quality/run`**. В нём:

- общий score;
- кластеры провалов (time_filter_mismatch, metric_mismatch, …);
- короткие рекомендации (словарь, clarification, chart rules, validator).

## 6. Как чинить failure clusters

| Кластер | Куда смотреть |
|---------|----------------|
| time_filter_mismatch | `semantic_dictionary.json`, нормализация периодов, тесты времени |
| metric_mismatch | `SemanticParser`, intent→metric mapping |
| wrong_chart_type | рекомендация графика / chart rules |
| clarification_missing | `ClarificationEngine` |
| guardrail / unsafe_sql | `policy_engine`, SQL validator |

## 7. Показ жюри за ~90 секунд

1. Дашборд менеджера / админа — карточка с тремя метриками Quality Center.
2. `/quality` — Overall score и четыре suite-карточки.
3. Вкладка **Understanding** — один passed и один failed кейс (expected vs actual, SQL, trace).
4. **SQL Correctness** — фрагменты и result shape.
5. **Guardrails** — заблокированный опасный запрос.
6. Фраза: «Качество измеряется golden suite и repair brief, а не заявляется».

## 8. Чем отличаемся от «просто LLM → SQL»

Цепочка: **prompt → intent → semantic dictionary → metric/dimension/time → SQL generation → validation → (optional) execution → result shape → chart match → trace → confidence**, плюс **измеримые** golden suites и порог **`--fail-under`** в CI.
