CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key TEXT NOT NULL UNIQUE CHECK (role_key IN ('admin', 'manager', 'marketer', 'executive')),
  role_name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_demo_user BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at TIMESTAMPTZ,
  role_id UUID NOT NULL REFERENCES roles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  display_name TEXT,
  avatar_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  locale TEXT NOT NULL DEFAULT 'en',
  preferences_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  is_default_workspace BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS notebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  notebook_status TEXT NOT NULL DEFAULT 'active' CHECK (notebook_status IN ('active', 'archived', 'draft')),
  context_chain_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  latest_cell_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notebook_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  cell_type TEXT NOT NULL CHECK (cell_type IN ('prompt', 'clarification', 'sql', 'table', 'chart', 'insight', 'trace', 'forecast')),
  position INT NOT NULL CHECK (position > 0),
  prompt_text TEXT,
  interpreted_intent JSONB,
  extracted_entities_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  semantic_terms_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_sql TEXT,
  validation_status TEXT NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending', 'passed', 'failed', 'blocked')),
  execution_status TEXT NOT NULL DEFAULT 'not_started' CHECK (execution_status IN ('not_started', 'running', 'succeeded', 'failed', 'timeout')),
  chart_type TEXT,
  selected_chart_type TEXT,
  insight_text TEXT,
  confidence_score NUMERIC(5,4) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  clarification_required BOOLEAN NOT NULL DEFAULT FALSE,
  clarification_question TEXT,
  clarification_options_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  parent_cell_id UUID REFERENCES notebook_cells(id) ON DELETE SET NULL,
  context_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  trace_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  forecast_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (notebook_id, position)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_notebooks_latest_cell'
      AND table_name = 'notebooks'
  ) THEN
    ALTER TABLE notebooks
      ADD CONSTRAINT fk_notebooks_latest_cell
      FOREIGN KEY (latest_cell_id) REFERENCES notebook_cells(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS cell_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cell_id UUID NOT NULL REFERENCES notebook_cells(id) ON DELETE CASCADE,
  notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  run_number INT NOT NULL DEFAULT 1,
  run_status TEXT NOT NULL DEFAULT 'started' CHECK (run_status IN ('started', 'succeeded', 'failed', 'timeout', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INT,
  generated_sql TEXT,
  validation_report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  execution_engine TEXT DEFAULT 'postgresql',
  rows_returned INT,
  result_schema_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  result_preview_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  confidence_score NUMERIC(5,4) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  trace_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cell_id, run_number)
);

CREATE TABLE IF NOT EXISTS data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('postgresql', 'csv', 'api', 'warehouse')),
  connection_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  credentials_ref TEXT,
  source_status TEXT NOT NULL DEFAULT 'active' CHECK (source_status IN ('active', 'inactive', 'error')),
  schema_cache_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, source_name)
);

CREATE TABLE IF NOT EXISTS semantic_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  term_key TEXT NOT NULL,
  term_name TEXT NOT NULL,
  definition TEXT,
  business_domain TEXT,
  term_type TEXT NOT NULL DEFAULT 'metric' CHECK (term_type IN ('metric', 'dimension', 'entity', 'filter')),
  canonical_table TEXT,
  canonical_column TEXT,
  metric_formula_sql TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, term_key)
);

CREATE TABLE IF NOT EXISTS semantic_term_synonyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES semantic_terms(id) ON DELETE CASCADE,
  synonym_text TEXT NOT NULL,
  normalized_synonym CITEXT NOT NULL,
  weight NUMERIC(5,4) NOT NULL DEFAULT 1.0 CHECK (weight >= 0 AND weight <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (term_id, normalized_synonym)
);

CREATE TABLE IF NOT EXISTS query_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  target_role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
  template_key TEXT NOT NULL,
  template_name TEXT NOT NULL,
  description TEXT,
  nl_prompt_template TEXT NOT NULL,
  sql_template TEXT,
  default_chart_type TEXT,
  default_params_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  semantic_hints_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, template_key)
);

CREATE TABLE IF NOT EXISTS saved_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  notebook_id UUID REFERENCES notebooks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  report_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES saved_reports(id) ON DELETE CASCADE,
  cron_expression TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  delivery_channel TEXT NOT NULL DEFAULT 'email' CHECK (delivery_channel IN ('email', 'slack', 'webhook')),
  delivery_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nl_queries_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notebook_id UUID REFERENCES notebooks(id) ON DELETE SET NULL,
  cell_id UUID REFERENCES notebook_cells(id) ON DELETE SET NULL,
  raw_query_text TEXT NOT NULL,
  normalized_query_text TEXT,
  interpreted_intent JSONB NOT NULL DEFAULT '{}'::jsonb,
  extracted_entities_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  semantic_terms_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  clarification_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  context_chain_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_score NUMERIC(5,4) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS generated_sql_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  notebook_id UUID REFERENCES notebooks(id) ON DELETE SET NULL,
  cell_id UUID REFERENCES notebook_cells(id) ON DELETE SET NULL,
  run_id UUID REFERENCES cell_runs(id) ON DELETE SET NULL,
  generated_sql TEXT NOT NULL,
  sql_hash TEXT,
  validation_status TEXT NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending', 'passed', 'failed', 'blocked')),
  validation_report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  execution_status TEXT NOT NULL DEFAULT 'not_started' CHECK (execution_status IN ('not_started', 'succeeded', 'failed', 'timeout')),
  rows_returned INT,
  duration_ms INT,
  timeout_hit BOOLEAN NOT NULL DEFAULT FALSE,
  blocked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  layout_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_auto_generated BOOLEAN NOT NULL DEFAULT FALSE,
  source_history_window_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  widget_type TEXT NOT NULL CHECK (widget_type IN ('kpi', 'table', 'line_chart', 'bar_chart', 'pie_chart', 'map', 'forecast')),
  position_x INT NOT NULL DEFAULT 0,
  position_y INT NOT NULL DEFAULT 0,
  width INT NOT NULL DEFAULT 4,
  height INT NOT NULL DEFAULT 3,
  metric_key TEXT,
  chart_type TEXT,
  source_type TEXT NOT NULL DEFAULT 'query' CHECK (source_type IN ('query', 'template', 'forecast', 'manual')),
  source_ref_id UUID,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  refresh_interval_sec INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  cell_id UUID REFERENCES notebook_cells(id) ON DELETE SET NULL,
  sql_log_id UUID REFERENCES generated_sql_logs(id) ON DELETE SET NULL,
  original_sql TEXT NOT NULL,
  corrected_sql TEXT NOT NULL,
  correction_reason TEXT,
  corrected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  applied_to_learning BOOLEAN NOT NULL DEFAULT TRUE,
  learning_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  ip_address INET,
  user_agent TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  storage_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  checksum_sha256 TEXT,
  upload_status TEXT NOT NULL DEFAULT 'uploaded' CHECK (upload_status IN ('uploaded', 'processing', 'failed', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS data_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  uploaded_file_id UUID REFERENCES uploaded_files(id) ON DELETE SET NULL,
  initiated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL DEFAULT 'csv_import' CHECK (job_type IN ('csv_import', 'api_import', 'db_sync')),
  job_status TEXT NOT NULL DEFAULT 'queued' CHECK (job_status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  source_schema_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  transform_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  rows_in BIGINT,
  rows_out BIGINT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inferred_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id UUID NOT NULL REFERENCES data_import_jobs(id) ON DELETE CASCADE,
  schema_version INT NOT NULL DEFAULT 1,
  inferred_schema_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  column_stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  quality_flags_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_score NUMERIC(5,4) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (import_job_id, schema_version)
);

CREATE TABLE IF NOT EXISTS cleaned_datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  import_job_id UUID REFERENCES data_import_jobs(id) ON DELETE SET NULL,
  dataset_name TEXT NOT NULL,
  target_table_name TEXT,
  cleaning_rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  quality_report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dataset_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaned_dataset_id UUID NOT NULL REFERENCES cleaned_datasets(id) ON DELETE CASCADE,
  version_number INT NOT NULL CHECK (version_number > 0),
  schema_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_count BIGINT,
  checksum_sql TEXT,
  materialized_table_name TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cleaned_dataset_id, version_number)
);

CREATE TABLE IF NOT EXISTS metric_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  time_grain TEXT NOT NULL DEFAULT 'day' CHECK (time_grain IN ('day', 'week', 'month', 'quarter')),
  dimensions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metric_value_num NUMERIC(18,4),
  metric_value_text TEXT,
  source_table TEXT,
  source_ref_id UUID,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, metric_key, snapshot_date, time_grain, dimensions_json)
);

CREATE TABLE IF NOT EXISTS forecast_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  notebook_id UUID REFERENCES notebooks(id) ON DELETE SET NULL,
  cell_id UUID REFERENCES notebook_cells(id) ON DELETE SET NULL,
  metric_key TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('rolling_average', 'trend_extrapolation', 'linear_regression')),
  parameters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  train_window_start DATE,
  train_window_end DATE,
  horizon_steps INT NOT NULL CHECK (horizon_steps > 0),
  run_status TEXT NOT NULL DEFAULT 'queued' CHECK (run_status IN ('queued', 'running', 'succeeded', 'failed')),
  forecast_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS forecast_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_run_id UUID NOT NULL REFERENCES forecast_runs(id) ON DELETE CASCADE,
  step_index INT NOT NULL CHECK (step_index >= 1),
  forecast_timestamp TIMESTAMPTZ NOT NULL,
  predicted_value NUMERIC(18,4) NOT NULL,
  lower_bound NUMERIC(18,4),
  upper_bound NUMERIC(18,4),
  confidence_score NUMERIC(5,4) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  components_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (forecast_run_id, step_index)
);

CREATE TABLE IF NOT EXISTS anomaly_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  metric_snapshot_id UUID REFERENCES metric_snapshots(id) ON DELETE SET NULL,
  forecast_run_id UUID REFERENCES forecast_runs(id) ON DELETE SET NULL,
  anomaly_type TEXT NOT NULL CHECK (anomaly_type IN ('spike', 'drop', 'drift', 'seasonal_break')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  observed_value NUMERIC(18,4) NOT NULL,
  expected_value NUMERIC(18,4),
  deviation_score NUMERIC(10,4),
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  event_status TEXT NOT NULL DEFAULT 'open' CHECK (event_status IN ('open', 'acknowledged', 'resolved')),
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS insight_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  notebook_id UUID REFERENCES notebooks(id) ON DELETE SET NULL,
  cell_id UUID REFERENCES notebook_cells(id) ON DELETE SET NULL,
  run_id UUID REFERENCES cell_runs(id) ON DELETE SET NULL,
  insight_type TEXT NOT NULL CHECK (insight_type IN ('trend', 'comparison', 'anomaly', 'forecast', 'summary')),
  insight_text TEXT NOT NULL,
  supporting_evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_score NUMERIC(5,4) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  review_status TEXT NOT NULL DEFAULT 'auto' CHECK (review_status IN ('auto', 'reviewed', 'dismissed')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anonymized_incity_orders (
  city_id TEXT NOT NULL,
  offset_hours INT NOT NULL,
  order_id TEXT NOT NULL,
  tender_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  driver_id TEXT NOT NULL,
  status_order TEXT NOT NULL,
  status_tender TEXT NOT NULL,
  order_timestamp TIMESTAMPTZ,
  tender_timestamp TIMESTAMPTZ,
  driveraccept_timestamp TIMESTAMPTZ,
  driverarrived_timestamp TIMESTAMPTZ,
  driverstarttheride_timestamp TIMESTAMPTZ,
  driverdone_timestamp TIMESTAMPTZ,
  clientcancel_timestamp TIMESTAMPTZ,
  drivercancel_timestamp TIMESTAMPTZ,
  order_modified_local TIMESTAMPTZ,
  cancel_before_accept_local TIMESTAMPTZ,
  distance_in_meters NUMERIC(18,3),
  duration_in_seconds NUMERIC(18,3),
  price_order_local NUMERIC(18,3),
  price_tender_local NUMERIC(18,3),
  price_start_local NUMERIC(18,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (city_id, order_id, tender_id)
);

CREATE INDEX IF NOT EXISTS idx_notebook_cells_notebook_position ON notebook_cells (notebook_id, position);
CREATE INDEX IF NOT EXISTS idx_notebook_cells_parent ON notebook_cells (parent_cell_id);
CREATE INDEX IF NOT EXISTS idx_notebook_cells_validation_execution ON notebook_cells (validation_status, execution_status);
CREATE INDEX IF NOT EXISTS idx_notebook_cells_trace_gin ON notebook_cells USING GIN (trace_payload_json);
CREATE INDEX IF NOT EXISTS idx_nl_queries_context_gin ON nl_queries_history USING GIN (context_chain_json);
CREATE INDEX IF NOT EXISTS idx_generated_sql_workspace_created ON generated_sql_logs (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_metric_snapshots_workspace_metric_date ON metric_snapshots (workspace_id, metric_key, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_anonymized_incity_orders_order_ts ON anonymized_incity_orders (order_timestamp);
CREATE INDEX IF NOT EXISTS idx_anonymized_incity_orders_status_order ON anonymized_incity_orders (status_order);
CREATE INDEX IF NOT EXISTS idx_anonymized_incity_orders_status_tender ON anonymized_incity_orders (status_tender);

INSERT INTO roles (id, role_key, role_name, description) VALUES
('11111111-1111-1111-1111-111111111111', 'admin', 'Admin', 'Platform governance and correction learning'),
('22222222-2222-2222-2222-222222222222', 'manager', 'Manager', 'Operational in-city analytics'),
('33333333-3333-3333-3333-333333333333', 'marketer', 'Marketer', 'Order funnel and cancellation analytics'),
('44444444-4444-4444-4444-444444444444', 'executive', 'Executive', 'Strategic high-level analytics')
ON CONFLICT (role_key) DO NOTHING;

INSERT INTO users (id, email, password_hash, is_demo_user, is_active, role_id) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'admin@drivee.demo', '$2b$12$demo.hash.admin', TRUE, TRUE, (SELECT id FROM roles WHERE role_key = 'admin' LIMIT 1)),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'manager@drivee.demo', '$2b$12$demo.hash.manager', TRUE, TRUE, (SELECT id FROM roles WHERE role_key = 'manager' LIMIT 1)),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'marketer@drivee.demo', '$2b$12$demo.hash.marketer', TRUE, TRUE, (SELECT id FROM roles WHERE role_key = 'marketer' LIMIT 1)),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'executive@drivee.demo', '$2b$12$demo.hash.executive', TRUE, TRUE, (SELECT id FROM roles WHERE role_key = 'executive' LIMIT 1))
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_profiles (user_id, first_name, last_name, display_name, timezone, locale, preferences_json) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Demo', 'Admin', 'Demo Admin', 'Europe/Moscow', 'ru', '{"theme":"light"}'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Demo', 'Manager', 'Demo Manager', 'Europe/Moscow', 'ru', '{"theme":"light"}'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Demo', 'Marketer', 'Demo Marketer', 'Europe/Moscow', 'ru', '{"theme":"light"}'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'Demo', 'Executive', 'Demo Executive', 'Europe/Moscow', 'ru', '{"theme":"light"}')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO workspaces (id, name, slug, owner_user_id, settings_json) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Drivee Demo Workspace', 'drivee-demo', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '{"default_currency":"RUB"}')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO workspace_memberships (workspace_id, user_id, role_id, is_default_workspace) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '22222222-2222-2222-2222-222222222222', TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '33333333-3333-3333-3333-333333333333', TRUE),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '44444444-4444-4444-4444-444444444444', TRUE)
ON CONFLICT (workspace_id, user_id) DO NOTHING;

INSERT INTO semantic_terms (id, workspace_id, term_key, term_name, definition, business_domain, term_type, canonical_table, canonical_column, metric_formula_sql, metadata_json, created_by) VALUES
('c0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'orders_count', 'Количество заказов', 'Общее количество заказов', 'operations', 'metric', 'anonymized_incity_orders', 'order_id', 'COUNT(*)', '{"unit":"rows"}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'),
('c0000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'done_rides', 'Завершенные поездки', 'Заказы с driverdone_timestamp', 'operations', 'metric', 'anonymized_incity_orders', 'driverdone_timestamp', 'COUNT(CASE WHEN driverdone_timestamp IS NOT NULL THEN 1 END)', '{"unit":"rows"}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'),
('c0000000-0000-0000-0000-000000000003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'client_cancellations', 'Отмены клиентом', 'Заказы с clientcancel_timestamp', 'operations', 'metric', 'anonymized_incity_orders', 'clientcancel_timestamp', 'COUNT(CASE WHEN clientcancel_timestamp IS NOT NULL THEN 1 END)', '{"unit":"rows"}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'),
('c0000000-0000-0000-0000-000000000004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'avg_order_price', 'Средняя стоимость заказа', 'Среднее price_order_local', 'finance', 'metric', 'anonymized_incity_orders', 'price_order_local', 'AVG(price_order_local)', '{"unit":"local_currency"}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
ON CONFLICT (workspace_id, term_key) DO NOTHING;

INSERT INTO semantic_term_synonyms (term_id, synonym_text, normalized_synonym, weight) VALUES
('c0000000-0000-0000-0000-000000000001', 'заказы', 'заказы', 0.95),
('c0000000-0000-0000-0000-000000000001', 'orders', 'orders', 0.90),
('c0000000-0000-0000-0000-000000000002', 'завершенные поездки', 'завершенные поездки', 0.95),
('c0000000-0000-0000-0000-000000000003', 'отмены клиентом', 'отмены клиентом', 0.90),
('c0000000-0000-0000-0000-000000000004', 'средняя стоимость заказа', 'средняя стоимость заказа', 0.90)
ON CONFLICT (term_id, normalized_synonym) DO NOTHING;

INSERT INTO query_templates (id, workspace_id, target_role_id, template_key, template_name, description, nl_prompt_template, sql_template, default_chart_type, default_params_json, semantic_hints_json, is_system, created_by) VALUES
('d0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'weekly_cancellations_by_city', 'Weekly Cancellations by city_id', 'Weekly cancellations split by city_id', 'Покажи количество отмен по city_id за прошлую неделю', 'SELECT city_id, COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL)::bigint AS cancellations FROM public.anonymized_incity_orders WHERE order_timestamp >= current_date - interval ''7 day'' GROUP BY 1 ORDER BY 2 DESC', 'bar', '{"window_days":7}', '["client_cancellations","city_id"]', TRUE, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'),
('d0000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'done_rides_daily', 'Done Rides Daily', 'Daily completed rides trend', 'Сравни количество завершенных поездок по дням за 14 дней', 'SELECT date_trunc(''day'', order_timestamp)::date AS day, COUNT(*) FILTER (WHERE driverdone_timestamp IS NOT NULL)::bigint AS done_rides FROM public.anonymized_incity_orders WHERE order_timestamp >= current_date - interval ''14 day'' GROUP BY 1 ORDER BY 1', 'line', '{"window_days":14}', '["done_rides"]', TRUE, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
ON CONFLICT (workspace_id, template_key) DO NOTHING;

INSERT INTO anonymized_incity_orders (
  city_id, offset_hours, order_id, tender_id, user_id, driver_id,
  status_order, status_tender, order_timestamp, tender_timestamp, driveraccept_timestamp,
  driverarrived_timestamp, driverstarttheride_timestamp, driverdone_timestamp,
  clientcancel_timestamp, drivercancel_timestamp, order_modified_local, cancel_before_accept_local,
  distance_in_meters, duration_in_seconds, price_order_local, price_tender_local, price_start_local
) VALUES
('101', 3, 'ORD-1001', 'TND-1001', 'USR-1', 'DRV-1', 'done', 'matched', '2026-04-01T09:00:00Z', '2026-04-01T09:01:00Z', '2026-04-01T09:02:30Z', '2026-04-01T09:08:00Z', '2026-04-01T09:10:00Z', '2026-04-01T09:30:00Z', NULL, NULL, '2026-04-01T09:30:00Z', NULL, 8200, 1200, 420, 410, 350),
('101', 3, 'ORD-1002', 'TND-1002', 'USR-2', 'DRV-2', 'client_cancelled', 'searching', '2026-04-01T10:00:00Z', '2026-04-01T10:00:30Z', NULL, NULL, NULL, NULL, '2026-04-01T10:03:00Z', NULL, '2026-04-01T10:03:00Z', '2026-04-01T10:03:00Z', 0, 180, 0, 390, 330),
('205', 3, 'ORD-1003', 'TND-1003', 'USR-3', 'DRV-3', 'driver_cancelled', 'matched', '2026-04-02T11:00:00Z', '2026-04-02T11:01:00Z', '2026-04-02T11:02:00Z', NULL, NULL, NULL, NULL, '2026-04-02T11:06:00Z', '2026-04-02T11:06:00Z', NULL, 0, 300, 0, 450, 390),
('310', 6, 'ORD-1004', 'TND-1004', 'USR-4', 'DRV-4', 'done', 'matched', '2026-04-03T12:00:00Z', '2026-04-03T12:01:20Z', '2026-04-03T12:03:00Z', '2026-04-03T12:07:30Z', '2026-04-03T12:09:00Z', '2026-04-03T12:28:00Z', NULL, NULL, '2026-04-03T12:28:00Z', NULL, 5600, 1140, 360, 355, 300)
ON CONFLICT (city_id, order_id, tender_id) DO NOTHING;

INSERT INTO notebooks (id, workspace_id, owner_user_id, title, description, notebook_status, context_chain_json) VALUES
('ac000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Weekly In-city Analysis', 'Demo notebook for manager flow', 'active', '{"time_window":"last_7_days","base_metric":"orders_count"}')
ON CONFLICT DO NOTHING;

INSERT INTO notebook_cells (id, notebook_id, cell_type, position, prompt_text, interpreted_intent, extracted_entities_json, semantic_terms_json, generated_sql, validation_status, execution_status, chart_type, selected_chart_type, insight_text, confidence_score, clarification_required, clarification_question, clarification_options_json, parent_cell_id, context_snapshot_json, trace_payload_json, forecast_payload_json, created_by) VALUES
('ad000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000001', 'prompt', 1, 'Покажи количество отмен по city_id за последние 7 дней', '{"intent":"comparison"}', '{"metric":"client_cancellations","window_days":7}', '["client_cancellations"]', 'SELECT city_id, COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL)::bigint AS cancellations FROM public.anonymized_incity_orders WHERE order_timestamp >= current_date - interval ''7 day'' GROUP BY 1 ORDER BY 2 DESC', 'passed', 'succeeded', 'horizontal_bar', 'horizontal_bar', 'Есть city_id с повышенной долей отмен.', 0.87, FALSE, NULL, '[]', NULL, '{"window":"7d"}', '{"used_tables":["anonymized_incity_orders"],"used_columns":["city_id","clientcancel_timestamp","drivercancel_timestamp"],"warnings":[]}', '{"method":"linear_regression","horizon_steps":4}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'),
('ad000000-0000-0000-0000-000000000002', 'ac000000-0000-0000-0000-000000000001', 'clarification', 2, 'А теперь только по city_id=101', '{"intent":"refine_filter"}', '{"city_id":"101"}', '["client_cancellations"]', 'SELECT date_trunc(''day'', order_timestamp)::date AS day, COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL)::bigint AS cancellations FROM public.anonymized_incity_orders WHERE city_id = ''101'' GROUP BY 1 ORDER BY 1', 'passed', 'succeeded', 'line', 'line', 'По city_id=101 отмены выше базового уровня.', 0.84, FALSE, NULL, '[]', 'ad000000-0000-0000-0000-000000000001', '{"window":"7d","city_id":"101"}', '{"used_tables":["anonymized_incity_orders"],"used_columns":["day","clientcancel_timestamp","drivercancel_timestamp","city_id"],"warnings":[]}', '{"method":"trend_extrapolation","horizon_steps":4}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2')
ON CONFLICT DO NOTHING;

UPDATE notebooks
SET latest_cell_id = 'ad000000-0000-0000-0000-000000000002'
WHERE id = 'ac000000-0000-0000-0000-000000000001';
