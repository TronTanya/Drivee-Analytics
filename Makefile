DC = docker compose

.PHONY: up down logs ps rebuild migrate seed backend-shell frontend-shell postgres-shell restart-stack smoke ds-quality nl-golden-regression nl-clarification-golden-regression test-smoke test-nl test-guardrails test-sql-correctness test-sql-correctness-live test-cov-core test-e2e test-e2e-quick e2e quality-eval quality-eval-live

up:
	$(DC) up --build

down:
	$(DC) down

logs:
	$(DC) logs -f

ps:
	$(DC) ps

rebuild:
	$(DC) build --no-cache

migrate:
	$(DC) run --rm backend alembic upgrade head

seed:
	$(DC) run --rm backend python scripts/seed_demo_data.py

backend-shell:
	$(DC) exec backend sh

frontend-shell:
	$(DC) exec frontend sh

postgres-shell:
	$(DC) exec postgres psql -U $${POSTGRES_USER:-drivee} -d $${POSTGRES_DB:-drivee_analytics}

# Без этого при `docker compose restart` фронт поднимается раньше uvicorn (миграции/импорт train) → прокси 500.
restart-stack:
	$(DC) stop frontend || true
	$(DC) restart postgres backend
	$(DC) up -d frontend

smoke:
	$(DC) run --rm backend python -m pytest -m smoke -q

ds-quality:
	$(MAKE) test-smoke && $(MAKE) test-nl && $(MAKE) test-guardrails

nl-golden-regression:
	$(DC) run --rm backend python -m pytest tests/unit/test_defense_demo_nl_goldens.py -q && $(MAKE) nl-clarification-golden-regression

nl-clarification-golden-regression:
	$(DC) run --rm backend python -m pytest tests/unit/test_defense_demo_clarification_goldens.py -q

# Быстрый smoke subset (HTTP wiring + базовые контракты).
test-smoke:
	$(DC) run --rm backend python -m pytest tests/smoke -q

# Стабильный NL regression suite для защиты.
test-nl:
	$(DC) run --rm backend python -m pytest tests/demo/test_curated_demo_nl_regression.py tests/unit/test_defense_demo_nl_goldens.py tests/unit/test_defense_demo_clarification_goldens.py tests/orchestration/test_nl_interpretation_cases.py -q

# Guardrails/policy subset (валидатор + policy engine + sql trust).
test-guardrails:
	$(DC) run --rm backend python -m pytest tests/guardrails tests/sql_validation -q

# Детерминированная проверка фрагментов SQL (golden sql_correctness_cases.json).
test-sql-correctness:
	$(DC) run --rm backend python -m pytest tests/evaluation/test_sql_correctness_evaluator.py tests/api/test_evaluation_api.py::test_sql_correctness_cases tests/api/test_evaluation_api.py::test_sql_correctness_summary_schema tests/api/test_evaluation_api.py::test_sql_correctness_run -q

# Live SQL parity: mode=live с graceful skip при недостаточном train.
test-sql-correctness-live:
	$(DC) run --rm backend python -c "from app.services.evaluation.sql_correctness_evaluator import run_sql_correctness_evaluation; s, _ = run_sql_correctness_evaluation('live'); print(s.model_dump())"

# NL→SQL генерация, семантика времени, sql_trust (без полного e2e Playwright).
test-orchestration-all:
	$(DC) run --rm backend python -m pytest tests/orchestration tests/sql_validation/test_sql_trust.py -q

# Golden NL→SQL Quality Suite (метрики + API, без внешнего LLM в mock-режиме).
test-nl-sql-quality:
	$(DC) run --rm backend python -m pytest tests/evaluation tests/api/test_evaluation_api.py -q

# Drivee Quality Center: CLI прогон всех suite с порогом качества (exit 1 если ниже).
quality-eval:
	$(DC) run --rm backend python scripts/run_quality_evals.py --suite all --mode deterministic --fail-under 0.85

quality-eval-live:
	$(DC) run --rm backend python scripts/run_quality_evals.py --suite all --mode live --fail-under 0.85

# Coverage по ключевым модулям orchestration/guardrails.
test-cov-core:
	$(DC) run --rm backend sh -lc "python -m pip install -q pytest-cov && python -m pytest tests/orchestration tests/guardrails tests/sql_validation --cov=app/services/orchestration --cov=app/services/guardrails --cov-report=term-missing -q"

# Браузерный happy-path защиты: поднимите stack (`make up`) или фронт+бэк локально, затем:
#   cd frontend && npx playwright install chromium
# В CI с `CI=true` тесты выполнятся только при RUN_E2E=1 (см. e2e/demo-defense-flow.spec.ts и e2e/jury-scenarios-smoke.spec.ts).
e2e:
	cd frontend && RUN_E2E=1 npm run test:e2e:defense && RUN_E2E=1 npm run test:e2e:jury

test-e2e: e2e

test-e2e-quick:
	cd frontend && RUN_E2E=1 npm run test:e2e:jury:quick
