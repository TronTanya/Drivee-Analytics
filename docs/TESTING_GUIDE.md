# Руководство по тестированию

## Быстрые команды (Makefile)

| Цель | Назначение |
|------|------------|
| `make test-smoke` | Минимальный smoke backend |
| `make test-nl` | NL регрессия + golden defense + **tests/golden** |
| `make test-guardrails` | guardrails + sql_validation |
| `make test-security` | инъекции + `test_sql_safety` |
| `make test-golden` | golden NL→SQL + defense unit goldens |
| `make test-backend` | срез для CI: golden, security, guardrails, sql_validation, orchestration, evaluation API |
| `make test-frontend` | `npm run lint` + `npm run test` (заглушка до подключения unit-раннера) |
| `make test-demo` | `demo-live` + smoke |
| `make test-all` | backend срез + frontend |
| `make e2e` | Playwright defense + jury (нужен `RUN_E2E=1`, см. package.json) |

## Backend в Docker

```bash
docker compose run --rm backend python -m pytest tests/golden -q
docker compose run --rm backend python -m pytest tests/security -q
docker compose run --rm backend python -m pytest tests/guardrails/test_role_policy.py -q
```

## Frontend

```bash
cd frontend && npm run lint
cd frontend && npm run test        # заглушка exit 0
cd frontend && npm run test:e2e:strict   # Playwright без --pass-with-no-tests (нужны spec-файлы)
```

## Полезные маркеры pytest

- `@pytest.mark.sql_accuracy` — тяжёлые тесты с полным train в Postgres.
- `RUN_E2E=1` — включение e2e в CI.

## Где смотреть отчёты качества

- `make quality-eval` — агрегированный Quality Center CLI.
- API: `GET /api/v1/quality/summary`.
