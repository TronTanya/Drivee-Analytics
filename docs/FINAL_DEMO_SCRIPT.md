# Скрипт финального демо (3–5 минут)

## 0. Подготовка (до жюри)

1. `make demo-live` — дождаться backend `/health` и frontend HEAD.
2. Открыть UI `http://localhost:3001`, войти **manager@drivee.local / demo123**.
3. Убедиться, что в `.env` фронта указан прямой API: `NEXT_PUBLIC_API_URL=http://localhost:8000`.

## 1. Manager → Notebook (90 с)

- Dashboard manager: показать KPI, **Quality Center** entry, train summary.
- Перейти в notebook сценария (например ops-health или демо-id из сида).
- Кратко: «цепочка prompt → SQL → table/chart → insight».

## 2. NL→SQL + clarification (60 с)

- Запрос с явной метрикой: «топ-5 городов по выручке».
- Запрос с неоднозначностью: **«Какие каналы самые эффективные?»** → показать clarification options.
- Ответить опцией и выполнить второй шаг.

## 3. Trace + policy (45 с)

- Открыть **Trace**: язык, role policy summary, validation, chart recommendation (тип + уверенность + оси/серии).
- Подчеркнуть: это не чёрный ящик LLM.

## 4. Quality Center (45 с)

- `/quality` или кнопка с manager dashboard.
- Показать overall score и 1 suite (например guardrails или SQL correctness).

## 5. Закрытие (30 с)

- «Селект-only, нет UNION по умолчанию, role enforcement на API, golden suite для 10 RU фраз».
- При вопросе про ML: baseline forecast **MVP**, честно маркируем ограничения.

## Фраза на случай сбоя сети

«У нас есть deterministic quality run и docker-compose runbook; live зависит от Postgres и таймаутов — см. DEMO_LIVE_RUNBOOK».
