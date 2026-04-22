DC = docker compose

.PHONY: up down logs ps rebuild migrate seed backend-shell frontend-shell postgres-shell

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
