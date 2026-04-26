DC = docker compose

.PHONY: up down logs ps rebuild migrate seed backend-shell frontend-shell postgres-shell wait-backend safe-restart-backend restart-stack demo-live smoke ds-quality nl-golden-regression nl-clarification-golden-regression test-smoke test-nl test-guardrails test-sql-correctness test-sql-correctness-live test-cov-core test-e2e test-e2e-quick e2e quality-eval quality-eval-live eval test-backend test-frontend test-security test-golden test-demo test-jury-questions test-all

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

# Ждёт readiness backend после рестарта/пересоздания контейнера.
wait-backend:
	@echo "Ожидание backend /health (до 120 попыток по 2s)..."
	@i=0; until curl -sf "http://127.0.0.1:$${BACKEND_PORT:-8000}/health" >/dev/null; do \
	  i=$$((i+1)); if [ $$i -ge 120 ]; then echo "TIMEOUT: backend /health"; exit 1; fi; \
	  sleep 2; \
	done
	@echo "Backend OK."

# Безопасный рестарт backend: дожидается health перед возвратом в shell.
safe-restart-backend:
	$(DC) restart backend
	$(MAKE) wait-backend

# Без этого при `docker compose restart` фронт поднимается раньше uvicorn (миграции/импорт train) → прокси 500.
restart-stack:
	$(DC) stop frontend || true
	$(DC) restart postgres backend
	$(DC) up -d frontend

# Поднять стек для защиты и быстро проверить health (см. docs/DEMO_LIVE_RUNBOOK.md).
demo-live:
	$(DC) up -d
	@echo ""
	@echo "=== Drivee Analytics — demo live ==="
	@echo "Ожидание ответа backend /health (до 120 попыток по 3s)..."
	@i=0; until curl -sf "http://127.0.0.1:$${BACKEND_PORT:-8000}/health" >/dev/null; do \
	  i=$$((i+1)); if [ $$i -ge 120 ]; then echo "TIMEOUT: backend /health"; exit 1; fi; \
	  sleep 3; \
	done
	@echo "Backend OK."
	@echo "Проверка frontend (HTTP HEAD)..."
	@curl -sfI "http://127.0.0.1:$${FRONTEND_PORT:-3001}/" | head -n1
	@echo ""
	@echo "Откройте UI:  http://localhost:$${FRONTEND_PORT:-3001}"
	@echo "Backend API:   http://localhost:$${BACKEND_PORT:-8000}"
	@echo "Demo manager:  manager@drivee.local / demo123"
	@echo "Runbook:       docs/DEMO_LIVE_RUNBOOK.md"
	@echo ""

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
	$(DC) run --rm backend python -m pytest tests/demo/test_curated_demo_nl_regression.py tests/unit/test_defense_demo_nl_goldens.py tests/unit/test_defense_demo_clarification_goldens.py tests/orchestration/test_nl_interpretation_cases.py tests/golden/test_nl_to_sql_golden_cases.py -q

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

# Golden NL→SQL: тот же orchestrator, что API `/evaluation/nl-sql/run`; отчёт в backend/evals/results/latest_eval_results.json
eval:
	$(DC) run --rm backend python evals/run_nl_sql_eval.py --mode mock

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

# --- План хакатона: единые точки входа для CI / жюри ---
test-backend:
	$(DC) run --rm backend python -m pytest tests/golden tests/security tests/guardrails tests/sql_validation tests/orchestration tests/api/test_evaluation_api.py -q

test-frontend:
	cd frontend && npm run lint && npm run test

test-security:
	$(DC) run --rm backend python -m pytest tests/security tests/sql_validation/test_sql_safety.py -q

test-golden:
	$(DC) run --rm backend python -m pytest tests/golden tests/unit/test_defense_demo_nl_goldens.py tests/unit/test_defense_demo_clarification_goldens.py -q

test-demo:
	$(MAKE) demo-live && $(MAKE) test-smoke

test-jury-questions:
	$(DC) run --rm backend python -m pytest \
		tests/orchestration/test_structured_jury_sql_paths.py \
		tests/orchestration/test_semantic_parser.py \
		tests/orchestration/test_intent_sql_time_filters.py \
		tests/semantic_layer/test_semantic_dictionary_store.py \
		tests/unit/test_query_trace_input_normalization.py \
		tests/golden/test_jury_noisy_queries.py \
		tests/sql_validation/test_sql_trust.py \
		tests/test_jury_questions_regression.py -q

test-all:
	$(MAKE) test-backend && $(MAKE) test-frontend
