# Аналитическая база Drivee (incity + дневные метрики)

Три CSV из набора MPIT/Drivee загружаются в отдельные таблицы PostgreSQL и используются как основная аналитическая база для текущего контура.

## Таблицы

| Таблица | CSV | Назначение |
|---------|-----|------------|
| `public.incity_orders` | `incity.csv` | Деталь: заказ × тендер; `tender_id` может быть NULL; суррогатный PK `id`. |
| `public.passenger_daily_metrics` | `pass_detail.csv` | Дневные метрики пассажира (PK: city_id, user_id, order_date_part). |
| `public.driver_daily_metrics` | `driver_detail.csv` | Дневные метрики водителя (PK: city_id, driver_id, tender_date_part). |

## Логические связи (без FK)

- `incity_orders.user_id` = `passenger_daily_metrics.user_id`
- `incity_orders.driver_id` = `driver_daily_metrics.driver_id`
- `DATE(order_timestamp)` ↔ `passenger_daily_metrics.order_date_part`
- `DATE(tender_timestamp)` ↔ `driver_daily_metrics.tender_date_part`
- `city_id` — общая ось группировок.

## Импорт

```bash
docker compose exec backend python scripts/import_drivee_dataset.py \
  --incity /data/incity.csv --replace-incity \
  --pass-detail /data/pass_detail.csv --replace-pass \
  --driver-detail /data/driver_detail.csv --replace-driver
```

Опция `--limit N` ограничивает число строк при чтении каждого файла. Дубликаты по PK в дневных таблицах схлопываются (оставляется первая строка).

## Миграции

```bash
docker compose exec backend alembic upgrade head
```

Ревизия `202604251630` создаёт новые таблицы и удаляет устаревшие `mpit_*`.

## SQL и роли

- Таблицы добавлены в `SQL_WHITELIST_TABLES` / колонки в `SQL_WHITELIST_COLUMNS` (`app/core/config.py`).
- **Executive** не имеет доступа к `incity_orders` (только агрегаты `passenger_daily_metrics` и `driver_daily_metrics`).
- Запросы к `incity_orders` без агрегации и без явного временного фильтра **отклоняются** валидатором (`check_incity_orders_scan_policy`).

## NL→SQL шаблоны

Сид `seed_demo_data.py` добавляет ключи `drivee_nl_*` и админские шаблоны на `passenger_daily_metrics` / `driver_daily_metrics`. После обновления кода выполните:

`docker compose exec backend python scripts/import_drivee_dataset.py ...` и `python scripts/seed_demo_data.py` (или полный старт compose).
