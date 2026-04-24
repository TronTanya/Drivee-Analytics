DC = docker compose

.PHONY: up down logs ps rebuild migrate seed backend-shell frontend-shell postgres-shell smoke ds-quality nl-golden-regression nl-clarification-golden-regression test-smoke test-nl test-guardrails test-cov-core test-e2e test-e2e-quick e2e

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
