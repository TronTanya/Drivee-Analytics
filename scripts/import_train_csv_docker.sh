#!/usr/bin/env bash
# Импорт CSV в Postgres контейнера (таблица anonymized_incity_orders → VIEW public.train).
# По умолчанию: первые 16000 строк данных + --replace (очистить таблицу перед загрузкой).
#
# Использование:
#   ./scripts/import_train_csv_docker.sh
#   ./scripts/import_train_csv_docker.sh ~/Downloads/train.csv 16000
#
# Требуется: из корня репозитория, `docker compose` и запущенный stack (или только postgres+образ backend).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CSV_HOST="${1:-"$HOME/Downloads/train.csv"}"
# В выгрузках часто есть строки с пустым tender_id — после фильтра остаётся меньше строк; 20000 ≈ ≥16000 валидных.
LIMIT="${2:-20000}"

if [[ ! -f "$CSV_HOST" ]]; then
  echo "Файл не найден: $CSV_HOST" >&2
  echo "Пример: $0 /path/to/train.csv 16000" >&2
  exit 1
fi

cd "$ROOT"
docker compose run --rm \
  -v "${CSV_HOST}:/import/train.csv:ro" \
  backend python scripts/import_train_csv.py --path /import/train.csv --limit "${LIMIT}" --replace

echo "Готово. Проверка: docker exec drivee-postgres psql -U drivee -d drivee_analytics -c 'SELECT COUNT(*) FROM public.train;'"
