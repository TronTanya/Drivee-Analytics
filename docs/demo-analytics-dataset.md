# Тестовый набор для аналитики (`public.train` = VIEW над заказами)

Словарь колонок экспорта / анонимизированного CSV: [train-column-reference-ru.md](datasets/train-column-reference-ru.md).

Цель — чтобы дашборды, NL→SQL и шаблоны опирались на **объёмный**, многомерный срез, а не на четыре строки из bootstrap.

**Поверхность данных:** seed пишет строки в **факт-таблицу** заказов (DDL/ORM в репозитории); **`public.train`** — это VIEW с теми же колонками. В шаблонах, NL→SQL и whitelist валидатора фигурирует только **`train`** (+ staging `user_staging` после импорта CSV). Имя факт-таблицы в пользовательском SQL не используется.

## Что попадает в БД

| Измерение | Описание |
|-----------|----------|
| **Города** | `city_id`: `67`, `101`, `205`, `310`, `420`; у каждого свой `offset_hours` и множитель цены / склонность к отменам. |
| **Период** | Окно **63 дня** до UTC-«сегодня» при запуске seed (достаточно для 8+ недель и окон `CURRENT_DATE`). |
| **Каналы** | Колонка `order_channel`: `app`, `web`, `partner_api`, `call_center` (взвешенный случайный выбор, детерминированный от city/day/seq). |
| **Статусы** | `status_order` / `status_tender`: завершённые (`done` / `matched`), отмены клиента/водителя, «просроченный» поиск (`expired`), отмена до принятия (`cancel_before_accept_local`). |
| **Суммы** | `price_order_local`, `price_tender_local`, `price_start_local`; для отмен часто нули или доля от базовой цены. |

Строки с **`order_id` LIKE `'DEMO-%'`** считаются синтетическими: при каждом полном `seed_demo_data.py` они **удаляются и вставляются заново** (идемпотентность по префиксу).

Статические примеры `ORD-1001` … из `bootstrap_drivee.sql` не трогаются.

## Скрипты

1. **Полный seed** (пользователи, контекст данных, семантика, шаблоны, ноутбук, заказы):

   ```bash
   make seed
   # или: docker compose run --rm backend python scripts/seed_demo_data.py
   ```

2. **Только пересбор заказов** (после bootstrap / миграций):

   ```bash
   docker compose run --rm backend python -m app.demo_data.seed_analytics_orders
   ```

Требуется колонка **`order_channel`**: она задаётся в `backend/sql/bootstrap_drivee.sql` (`CREATE` + `ALTER ... IF NOT EXISTS` для старых БД). Без неё выполнение seed завершится ошибкой Postgres.

## Что можно показывать на данных

- **Сравнение по городам**: `GROUP BY city_id`, фильтры по `city_id`, топы отмен / выручки.
- **Динамика по дням**: `date_trunc('day', order_timestamp)`.
- **Текущая vs прошлая неделя**: шаблон `wow_done_rides_by_city` в `seed_demo_data.py` (`date_trunc('week', CURRENT_DATE)`).
- **Топы и рейтинги**: `ORDER BY ... DESC` + `LIMIT` (валидатор подставляет лимит для intent `ranking`).
- **Конверсия**: доля строк с `driverdone_timestamp` к `COUNT(DISTINCT order_id)`; шаблон `conversion_by_channel` и существующий `weekly_conversion`.
- **Шаблоны**: SQL-шаблоны из `ensure_query_templates` используют **`public.train`** и получают ненулевые ряды при свежем seed.

## Ограничения

- Данные **синтетические**, не для прод-решений.
- Привязка к **дате запуска**: для корректных «последних 7 дней» имеет смысл периодически перезапускать seed на стенде.
- `order_id` с префиксом `DEMO-` зарезервирован под генератор; не используйте его для ручных тестов, которые должны пережить повторный seed.

## Whitelist NL→SQL

Разрешённые **таблицы** для пользовательского SQL: **`train`** и таблицы staging по паттерну из конфига (`user_staging` / `t_*`). Колонка `order_channel` добавлена в `sql_whitelist_columns` (`app/core/config.py`) и в набор для роли **executive** (`sql_validation_constants.py`), чтобы сгенерированный SQL проходил валидацию.
