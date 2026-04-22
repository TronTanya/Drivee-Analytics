export type ForecastScenarioDto = {
  id: string;
  name: string;
  horizon_label: string;
  baseline: number;
  optimistic?: number;
  pessimistic?: number;
  unit?: string;
};

export type ForecastRunRequestDto = {
  workspace_id?: string;
  upload_id?: string | null;
  source_table?: string | null;
  date_column?: string | null;
  horizon_days?: number;
  notebook_id?: string;
  preferred_strategy?: string | null;
  // legacy compatibility
  metric_code?: string;
  horizon_weeks?: number;
};

export type ForecastRunResponseDto = {
  notebook_id?: string;
  scenarios?: ForecastScenarioDto[];
  narrative?: string;
  forecast_run_id?: string;
  workspace_id?: string;
  source_table?: string | null;
  date_column?: string;
  semantic_column_map?: Record<string, string>;
  metrics?: Record<string, unknown>;
  forecasts?: Record<string, unknown>;
  strategy_summary?: Record<string, unknown>;
  insights?: string[];
};

export type AutoMLBacktestRequestDto = {
  workspace_id: string;
  upload_id?: string | null;
  source_table?: string | null;
  date_column?: string | null;
  horizon_days: number;
  holdout_days: number;
  strategies?: string[];
};

export type AutoMLModelScoreDto = {
  strategy_key: string;
  status: string;
  mae?: number | null;
  rmse?: number | null;
  mape?: number | null;
  smape?: number | null;
  score?: number | null;
  backtest_points: number;
  backtest_preview?: Array<{ date: string; actual: number; predicted: number }>;
};

export type AutoMLForecastPointDto = {
  step: number;
  date: string;
  value: number;
};

export type AutoMLMetricLeaderboardDto = {
  metric_key: string;
  best_strategy?: string | null;
  best_score?: number | null;
  forecast_preview: AutoMLForecastPointDto[];
  models: AutoMLModelScoreDto[];
  quality?: Record<string, unknown>;
  feature_preview?: Array<Record<string, unknown>>;
  transform?: Record<string, unknown>;
};

export type AutoMLBacktestResponseDto = {
  workspace_id: string;
  upload_id?: string | null;
  source_table?: string | null;
  date_column: string;
  horizon_days: number;
  holdout_days: number;
  strategy_candidates: string[];
  metrics_snapshot: Record<string, unknown>;
  leaderboards: AutoMLMetricLeaderboardDto[];
};
