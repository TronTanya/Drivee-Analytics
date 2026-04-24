# Quality Center — pitch для жюри

## Зачем это в продукте

Quality Center — **доказательство контроля качества** NL→SQL: не «один раз сработало в демо», а воспроизводимые suite (understanding, SQL correctness, visualization, guardrails) с числовым score.

## Где в UI

- Страница **`/quality`** — полный центр: overview, suite, repair brief, stability.
- **Manager dashboard** (`/dashboard/manager`) — кнопка «Открыть Quality Center» для сценария защиты.

## API

- **`GET /api/v1/quality/summary`** — основной алиас для pitch (требует capability `view_quality_center`).
- **`GET /api/v1/evaluation/quality/summary`** — прежний путь, тот же контракт (backward compatible).

## Как прогнать локально

```bash
make quality-eval          # deterministic, fail-under 0.85
# или
docker compose run --rm backend python scripts/run_quality_evals.py --suite all --mode deterministic
```

## Что сказать жюри

1. Мы отделяем **продуктовый NL→SQL** от «чата»: policy, SQL validator, role matrix, trace.
2. Quality Center фиксирует регрессии по кейсам и даёт **единый overall score**.
3. Mock/fallback всегда помечаются в trace/UI/docs — нет скрытой магии.
