import type { TracePanelModel, TraceSemanticTerm, TraceStep, TraceStepStatus } from "@/lib/notebook/block-types";
import type { AnalyticsExplainabilityTraceV1Dto, AnalyticsTraceDto } from "@/types/api/trace";
import { isExplainabilityTraceV1 } from "@/types/api/trace";

export const EMPTY_TRACE: TracePanelModel = {
  schemaVersion: 1,
  languageDetected: "ru",
  rolePolicySummaryRu: "",
  interpretedIntent: "",
  structuredInterpretation: {},
  interpretationSummaryRu: "",
  interpretationNotes: [],
  sqlGuardrails: {},
  extractedEntities: {},
  semanticTerms: [],
  tablesUsed: [],
  resultColumns: [],
  generatedSql: "",
  validationStatus: "unknown",
  warnings: [],
  confidence: 0,
  clarificationRequested: false,
  clarificationReason: "",
  clarificationReasonSummaryRu: "",
  clarificationQuestion: "",
  followUpContextUsed: false,
  learnedCorrectionUsed: false,
  chartRecommendation: { chartType: "table", rationale: "", alternatives: [], confidence: 0 },
  forecastModeActive: false,
  forecastMethod: null,
  forecastSelection: {
    metricKey: null,
    selectedStrategy: null,
    dataQuality: {},
    backtestSummary: {}
  },
  forecastExplainability: {},
  qualityGate: {
    status: "passed",
    reasons: []
  },
  guardrails: {
    blocked: false,
    codes: [],
    messagesRu: []
  },
  steps: [],
  logs: [],
  resolvedSourceTable: ""
};

function coercePhaseStatus(s: string | undefined): TraceStepStatus {
  if (s === "running" || s === "pending" || s === "done" || s === "failed" || s === "skipped") return s;
  return "pending";
}

function mapV1(trace: AnalyticsExplainabilityTraceV1Dto): TracePanelModel {
  const terms: TraceSemanticTerm[] = (trace.semantic_terms ?? []).map((t) => ({
    termKey: t.term_key,
    surfaceForm: t.surface_form,
    sqlFragment: t.sql_fragment ?? "",
    confidence: typeof t.confidence === "number" ? t.confidence : 1
  }));
  const chart = trace.chart_recommendation ?? {
    chart_type: "table",
    rationale: "",
    alternatives: [] as string[]
  };
  const forecast = trace.forecast_mode ?? { active: false, method: null };
  const forecastSelection = trace.forecast_selection ?? {
    metric_key: null,
    selected_strategy: null,
    data_quality: {},
    backtest_summary: {}
  };
  const forecastExplainabilityRaw = trace.forecast_explainability;
  const forecastExplainability =
    forecastExplainabilityRaw && typeof forecastExplainabilityRaw === "object"
      ? (forecastExplainabilityRaw as Record<string, unknown>)
      : {};
  const qualityGate = trace.quality_gate ?? { status: "passed", reasons: [] };
  const guardrailsRaw = trace.guardrails ?? { blocked: false, codes: [], messages_ru: [] };
  const phases = trace.execution_phases ?? [];
  const stepsFromPhases: TraceStep[] = phases.map((p) => ({
    id: p.phase_id,
    label: p.label,
    detail: p.detail?.trim() ? p.detail : undefined,
    status: coercePhaseStatus(p.status)
  }));
  return {
    schemaVersion: 1,
    languageDetected: trace.language_detected ?? "ru",
    rolePolicySummaryRu: trace.role_policy_result_ru ?? "",
    interpretedIntent: trace.interpreted_intent ?? "",
    structuredInterpretation:
      trace.structured_interpretation && typeof trace.structured_interpretation === "object"
        ? trace.structured_interpretation
        : {},
    interpretationSummaryRu: trace.interpretation_summary_ru ?? "",
    interpretationNotes: Array.isArray(trace.interpretation_notes) ? trace.interpretation_notes.map(String) : [],
    sqlGuardrails: trace.sql_guardrails && typeof trace.sql_guardrails === "object" ? trace.sql_guardrails : {},
    extractedEntities: trace.extracted_entities ?? {},
    semanticTerms: terms,
    tablesUsed: trace.tables_used ?? [],
    resultColumns: trace.result_columns ?? [],
    generatedSql: trace.generated_sql ?? "",
    validationStatus: trace.validation_status ?? "unknown",
    warnings: trace.warnings ?? [],
    confidence: trace.confidence ?? 0,
    clarificationRequested: !!trace.clarification_requested,
    clarificationReason: (trace.clarification_reason ?? "").trim(),
    clarificationReasonSummaryRu: (trace.clarification_reason_summary_ru ?? "").trim(),
    clarificationQuestion: (trace.clarification_question ?? "").trim(),
    followUpContextUsed: !!trace.follow_up_context_used,
    learnedCorrectionUsed: !!trace.learned_correction_used,
    chartRecommendation: {
      chartType: chart.chart_type ?? "table",
      rationale: chart.rationale ?? "",
      alternatives: chart.alternatives ?? [],
      confidence: typeof chart.confidence === "number" ? chart.confidence : undefined,
      axesHint: chart.axes_hint ?? "",
      seriesKeys: Array.isArray(chart.series_keys) ? chart.series_keys.map(String) : []
    },
    forecastModeActive: !!forecast.active,
    forecastMethod: forecast.method ?? null,
    forecastSelection: {
      metricKey: forecastSelection.metric_key ?? null,
      selectedStrategy: forecastSelection.selected_strategy ?? null,
      dataQuality: forecastSelection.data_quality ?? {},
      backtestSummary: forecastSelection.backtest_summary ?? {}
    },
    forecastExplainability,
    qualityGate: {
      status: qualityGate.status ?? "passed",
      reasons: qualityGate.reasons ?? []
    },
    guardrails: {
      blocked: !!guardrailsRaw.blocked,
      codes: Array.isArray(guardrailsRaw.codes) ? guardrailsRaw.codes.map(String) : [],
      messagesRu: Array.isArray(guardrailsRaw.messages_ru)
        ? guardrailsRaw.messages_ru.map(String)
        : []
    },
    steps: stepsFromPhases,
    logs: []
  };
}

function mapLegacy(trace: AnalyticsTraceDto): TracePanelModel {
  const t = trace as {
    confidence: number;
    warnings: string[];
    used_tables: string[];
    used_columns: string[];
  };
  const validationOk = (t.warnings ?? []).length === 0;
  return {
    ...EMPTY_TRACE,
    confidence: t.confidence ?? 0,
    warnings: t.warnings ?? [],
    tablesUsed: t.used_tables ?? [],
    resultColumns: t.used_columns ?? [],
    validationStatus: validationOk ? "passed" : "failed",
    interpretedIntent: "Legacy trace — run again for full explainability.",
    steps: [
      { id: "1", label: "Interpret intent", detail: "Natural language → analytics plan", status: "done" },
      {
        id: "2",
        label: "Resolve schema",
        detail: (t.used_tables ?? []).join(", ") || "—",
        status: "done"
      },
      { id: "3", label: "Generate SQL & visuals", status: "done" },
      {
        id: "4",
        label: "Validate & execute",
        status: validationOk ? "done" : "failed"
      }
    ],
    logs: [
      { level: "info", message: "Planner selected candidate tables.", at: "t+0.2s" },
      { level: "info", message: "SQL lint completed.", at: "t+0.6s" },
      ...((t.warnings ?? []).length
        ? (t.warnings ?? []).map((w) => ({ level: "warn" as const, message: w }))
        : [{ level: "info" as const, message: "No engine warnings." }])
    ]
  };
}

export function traceFromAnalytics(trace: AnalyticsTraceDto | undefined): TracePanelModel {
  if (!trace) return { ...EMPTY_TRACE };
  if (isExplainabilityTraceV1(trace)) return mapV1(trace);
  return mapLegacy(trace);
}

/** Trace из ответа аналитики + явная поверхность данных из корня ответа API. */
export function traceFromAnalyticsRun(
  trace: AnalyticsTraceDto | undefined,
  resolvedSourceTable?: string | null
): TracePanelModel {
  const base = traceFromAnalytics(trace);
  const rs = (resolvedSourceTable ?? "").trim();
  return { ...base, resolvedSourceTable: rs };
}

/** Read `trace_payload_json.explainability` from a notebook cell API payload. */
export function traceFromCellPayloadJson(payload: Record<string, unknown> | undefined): TracePanelModel {
  if (!payload) return { ...EMPTY_TRACE };
  const exp = payload.explainability;
  if (exp && typeof exp === "object" && (exp as AnalyticsExplainabilityTraceV1Dto).schema_version === 1) {
    return mapV1(exp as AnalyticsExplainabilityTraceV1Dto);
  }
  return { ...EMPTY_TRACE };
}
