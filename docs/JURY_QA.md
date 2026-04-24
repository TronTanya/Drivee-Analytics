# Q&A для жюри (кратко)

## 1. Чем вы отличаетесь от «ChatGPT → SQL»?

Оркестратор: intent → clarification → безопасная генерация → **валидатор** (SELECT-only, allowlist, LIMIT) → исполнение → **explainability trace** + chart policy. LLM не является единственным источником истины.

## 2. Как вы боретесь с SQL injection?

Многоуровнево: запрет multi-statement, опасных конструкций, **UNION по умолчанию выключен** (`sql_allow_union`), role/table/column allowlist, тесты в `tests/security` и `tests/sql_validation`.

## 3. Что если запрос неоднозначен?

Rules-first **clarification** (пример: «Какие каналы самые эффективные?» → выбор метрики: выручка, заказы, конверсия, средний чек). Без угадывания «лучшего» смысла.

## 4. Как работает role policy?

Матрица capability в `role_policy.py`, проверка через FastAPI `require_capability`: например, **редактирование словаря** только у ролей с `edit_dictionary`, расписание отчётов — `schedule_report` (executive не может планировать).

## 5. Где explainability?

Панель **Trace** в notebook: интерпретация, SQL, validation, guardrails, **язык запроса**, **role policy summary**, рекомендация графика (тип, уверенность, оси/серии), прогноз с дисклеймером MVP.

## 6. Что за прогноз?

**Baseline linear trend** по ряду (MVP, не production ML). В UI/trace явно: ограничения, R²/уверенность если есть, горизонт.

## 7. Как повторить live demo?

`make demo-live` и `docs/DEMO_LIVE_RUNBOOK.md`. Рекомендуется `NEXT_PUBLIC_API_URL=http://localhost:8000` для фронта, чтобы избежать таймаутов прокси.

## 8. Какие тесты есть?

`make test-backend`, `test-security`, `test-golden`, `test-all`; детали — `docs/TESTING_GUIDE.md`.

## 9. Что с mock данными?

Любой mock/fallback должен быть **явно** отмечен в trace или документации; демо-train лежит в репозитории (`backend/demo_data/train_minimal.csv`).

## 10. Как масштабировать?

Вынести evaluation в CI, включить строгий UNION policy в prod, расширить role matrix под SSO groups, подключить observability к audit событиям оркестратора.
