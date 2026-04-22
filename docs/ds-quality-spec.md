# Drivee DS Quality Spec

## Purpose

Этот документ фиксирует единый контракт качества для аналитики и прогноза в Drivee Analytics Notebook.

## Quality Metrics

- `sql_correctness_rate` — доля успешных SQL запусков после валидации.
- `insight_consistency_score` — доля инсайтов, подтверждаемых фактами из таблицы/графика.
- `forecast_mae` — средняя абсолютная ошибка прогноза.
- `forecast_smape` — симметричная процентная ошибка прогноза.
- `confidence_calibration_error` — разница между заявленной уверенностью и фактическим качеством.

## Release Gates

### Demo Gate (MVP)

- `sql_correctness_rate >= 0.95`
- `insight_consistency_score >= 0.90`
- `forecast_smape <= 35`
- `confidence_calibration_error <= 0.20`

### Production Gate

- `sql_correctness_rate >= 0.98`
- `insight_consistency_score >= 0.95`
- `forecast_smape <= 25`
- `confidence_calibration_error <= 0.12`

## Fail-Fast Rules

- Если SQL validation не пройдена, pipeline завершает run без SQL execution.
- Если для прогноза меньше 14 наблюдений или >30% пропусков, включается `baseline_only` режим.
- Если все candidate-модели не проходят backtest, возвращается naive baseline и предупреждение в trace.
- Если insight не содержит ни одного численного подтверждения, insight маркируется как low-trust.

## Trace Contract Additions

Для каждого прогноза в trace фиксируются:

- `quality_gate.status` (`passed` | `warning` | `failed`)
- `quality_gate.reasons[]`
- `forecast_selection.metric_key`
- `forecast_selection.selected_strategy`
- `forecast_selection.backtest_summary` (mae, smape, stability)
- `forecast_selection.data_quality` (history_points, missing_ratio, baseline_only)

## CI / Regression Checkpoints

- Прогон demo-prompt набора должен сохранять метрики качества не хуже порога Demo Gate.
- При деградации любой метрики сборка помечается как `quality_warning`.
