-- Drivee demo seed aligned to confirmed anonymized in-city orders schema.
-- Prerequisite: run bootstrap_drivee.sql first.
-- Uses public.train as canonical analytics source.

BEGIN;

-- === Notebooks (aligned demo scenarios) ===
INSERT INTO notebooks (id, workspace_id, owner_user_id, title, description, notebook_status, context_chain_json)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
   'Ops — cancellations by city_id', 'Manager scenario: weekly cancellations and completion quality', 'active',
   '{"scenario":"cancellations_by_city_id","grain":"day"}'),
  ('a2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
   'Operations — done rides daily', 'Comparison of completed rides by day', 'active',
   '{"scenario":"done_rides_daily"}'),
  ('a3333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
   'Executive forecast — orders 8w', 'Baseline trend forecast on order_count series', 'active',
   '{"scenario":"orders_forecast","horizon_weeks":8}'),
  ('a4444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   'Admin — semantic dictionary and guardrails', 'Business dictionary aligned to in-city schema', 'active',
   '{"scenario":"admin_dictionary"}')
ON CONFLICT (id) DO NOTHING;

-- === Notebook cells ===
INSERT INTO notebook_cells (
  id, notebook_id, cell_type, position, prompt_text, interpreted_intent, extracted_entities_json, semantic_terms_json,
  generated_sql, validation_status, execution_status, insight_text, confidence_score,
  clarification_required, clarification_options_json, context_snapshot_json, trace_payload_json, forecast_payload_json, created_by
) VALUES
  ('b1111111-1111-1111-1111-111111111101', 'a1111111-1111-1111-1111-111111111111', 'prompt', 1,
   'Покажи количество отмен по city_id за прошлую неделю', '{"intent":"comparison","metric":"client_cancellations"}',
   '{"window_days":7}', '["client_cancellations"]',
   'SELECT city_id, COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL)::bigint AS cancellations FROM public.train WHERE order_timestamp >= current_date - interval ''7 day'' GROUP BY 1 ORDER BY 2 DESC',
   'passed', 'succeeded', 'Есть city_id с повышенной долей отмен.', 0.86, false, '[]',
   '{"geo_fallback":"bar_for_city_id"}', '{"used_tables":["train"],"used_columns":["city_id","cancellations"]}', '{}',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'),
  ('b2222222-2222-2222-2222-222222222201', 'a2222222-2222-2222-2222-222222222222', 'prompt', 1,
   'Сравни количество завершенных поездок по дням', '{"intent":"trend","metric":"done_rides"}',
   '{"window_days":14}', '["done_rides"]',
   'SELECT date_trunc(''day'', order_timestamp)::date AS day, COUNT(*) FILTER (WHERE driverdone_timestamp IS NOT NULL)::bigint AS done_rides FROM public.train WHERE order_timestamp >= current_date - interval ''14 day'' GROUP BY 1 ORDER BY 1',
   'passed', 'succeeded', 'Серия завершенных поездок стабильна с локальными колебаниями.', 0.88, false, '[]',
   '{}', '{"used_tables":["train"],"used_columns":["day","driverdone_timestamp"]}', '{}',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'),
  ('b3333333-3333-3333-3333-333333333301', 'a3333333-3333-3333-3333-333333333333', 'prompt', 1,
   'Построй прогноз количества заказов на 8 недель', '{"intent":"forecast","metric":"orders_count"}',
   '{"horizon_weeks":8}', '["orders_count"]',
   'SELECT date_trunc(''day'', order_timestamp)::date AS day, COUNT(DISTINCT order_id)::bigint AS orders_count FROM public.train GROUP BY 1 ORDER BY 1',
   'passed', 'succeeded', 'Базовый прогноз показывает умеренный рост заказов.', 0.79, false, '[]',
   '{}', '{"used_tables":["train"],"used_columns":["day","order_id"]}', '{"method":"trend_extrapolation","horizon_steps":8}',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4')
ON CONFLICT (id) DO NOTHING;

UPDATE notebooks SET latest_cell_id = 'b1111111-1111-1111-1111-111111111101' WHERE id = 'a1111111-1111-1111-1111-111111111111';
UPDATE notebooks SET latest_cell_id = 'b2222222-2222-2222-2222-222222222201' WHERE id = 'a2222222-2222-2222-2222-222222222222';
UPDATE notebooks SET latest_cell_id = 'b3333333-3333-3333-3333-333333333301' WHERE id = 'a3333333-3333-3333-3333-333333333333';

-- === Semantic dictionary extension ===
INSERT INTO semantic_terms (id, workspace_id, term_key, term_name, definition, business_domain, term_type, canonical_table, canonical_column, metric_formula_sql, metadata_json, created_by)
VALUES
  ('c1000000-0000-0000-0000-000000000010', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'driver_cancellations', 'Отмены водителем', 'Количество строк с drivercancel_timestamp', 'operations', 'metric', 'train', 'drivercancel_timestamp',
   'COUNT(CASE WHEN drivercancel_timestamp IS NOT NULL THEN 1 END)', '{"owner":"ops"}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'),
  ('c1000000-0000-0000-0000-000000000011', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cancel_before_accept_count', 'Отмены до принятия', 'Количество строк с cancel_before_accept_local', 'operations', 'metric', 'train', 'cancel_before_accept_local',
   'COUNT(CASE WHEN cancel_before_accept_local IS NOT NULL THEN 1 END)', '{"owner":"ops"}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'),
  ('c1000000-0000-0000-0000-000000000012', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'time_to_accept_seconds', 'Время до принятия', 'Среднее время от order_timestamp до driveraccept_timestamp', 'operations', 'metric', 'train', 'driveraccept_timestamp',
   'AVG(EXTRACT(EPOCH FROM (driveraccept_timestamp::timestamp - order_timestamp::timestamp)))', '{"owner":"ops"}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
ON CONFLICT (workspace_id, term_key) DO NOTHING;

INSERT INTO semantic_term_synonyms (term_id, synonym_text, normalized_synonym, weight)
VALUES
  ('c1000000-0000-0000-0000-000000000010', 'driver cancellations', 'driver cancellations', 0.95),
  ('c1000000-0000-0000-0000-000000000011', 'отмены до принятия', 'отмены до принятия', 0.95),
  ('c1000000-0000-0000-0000-000000000012', 'время до принятия', 'время до принятия', 0.95)
ON CONFLICT (term_id, normalized_synonym) DO NOTHING;

-- === Query templates ===
INSERT INTO query_templates (id, workspace_id, target_role_id, template_key, template_name, description, nl_prompt_template, sql_template, default_chart_type, default_params_json, semantic_hints_json, is_system, created_by)
VALUES
  ('d1000000-0000-0000-0000-000000000010', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222',
   'avg_price_by_city_id', 'Средняя стоимость заказа по city_id', 'Сравнение средней стоимости заказа по city_id',
   'Покажи среднюю стоимость заказа по городам',
   'SELECT city_id, AVG(price_order_local)::numeric(18,2) AS avg_order_price FROM public.train GROUP BY 1 ORDER BY 2 DESC',
   'bar', '{"group_by":"city_id"}', '["avg_order_price","city_id"]', true, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'),
  ('d1000000-0000-0000-0000-000000000011', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222',
   'top_city_cancellations', 'Топ city_id по отменам', 'Топ-3 city_id по количеству отмен',
   'Топ-3 города по количеству отмененных заказов',
   'SELECT city_id, COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL)::bigint AS cancellations FROM public.train GROUP BY 1 ORDER BY 2 DESC LIMIT 3',
   'horizontal_bar', '{"limit":3}', '["client_cancellations","city_id"]', true, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
ON CONFLICT (workspace_id, template_key) DO NOTHING;

-- === Saved reports ===
INSERT INTO saved_reports (id, workspace_id, notebook_id, title, description, report_payload_json, created_by, is_shared)
VALUES
  ('f1000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'a1111111-1111-1111-1111-111111111111',
   'Weekly cancellations by city_id', 'Manager report export', '{"format":"pdf","sections":["table","insight"]}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', true),
  ('f1000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'a3333333-3333-3333-3333-333333333333',
   'Forecast pack — orders', '8w orders trend', '{"format":"pdf","forecast":true}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', true)
ON CONFLICT (id) DO NOTHING;

-- === NL query history ===
INSERT INTO nl_queries_history (id, workspace_id, user_id, notebook_id, cell_id, raw_query_text, normalized_query_text, interpreted_intent, semantic_terms_json, confidence_score)
VALUES
  ('f2000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
   'a1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111101',
   'Покажи количество отмен по city_id за прошлую неделю', 'покажи количество отмен по city_id за прошлую неделю', '{"intent":"comparison"}', '["client_cancellations"]', 0.86),
  ('f2000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
   'a3333333-3333-3333-3333-333333333333', 'b3333333-3333-3333-3333-333333333301',
   'Построй прогноз количества заказов на 8 недель', 'построй прогноз количества заказов на 8 недель', '{"intent":"forecast"}', '["orders_count"]', 0.79)
ON CONFLICT (id) DO NOTHING;

COMMIT;
