import type { TracePanelModel, TraceSemanticTerm } from "@/lib/notebook/block-types";
import type { AnalyticsExplainabilityTraceV1Dto, AnalyticsTraceDto } from "@/types/api/trace";
import { isExplainabilityTraceV1 } from "@/types/api/trace";

export const EMPTY_TRACE: TracePanelModel = {
  schemaVersion: 1,
  interpretedIntent: "",
  extractedEntities: {},
  semanticTerms: [],
  tablesUsed: [],
  resultColumns: [],
  generatedSql: "",
  validationStatus: "unknown",
  warnings: [],
  confidence: 0,
  clarificationRequested: false,
  followUpContextUsed: false,
  learnedCorrectionUsed: false,
  chartRecommendation: { chartType: "table", rationale: "", alternatives: [] },
  forecastModeActive: false,
  forecastMethod: null,
  steps: [],
  logs: []
};

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
  return {
    schemaVersion: 1,
    interpretedIntent: trace.interpreted_intent ?? "",
    extractedEntities: trace.extracted_entities ?? {},
    semanticTerms: terms,
    tablesUsed: trace.tables_used ?? [],
    resultColumns: trace.result_columns ?? [],
    generatedSql: trace.generated_sql ?? "",
    validationStatus: trace.validation_status ?? "unknown",
    warnings: trace.warnings ?? [],
    confidence: trace.confidence ?? 0,
    clarificationRequested: !!trace.clarification_requested,
    followUpContextUsed: !!trace.follow_up_context_used,
    learnedCorrectionUsed: !!trace.learned_correction_used,
    chartRecommendation: {
      chartType: chart.chart_type ?? "table",
      rationale: chart.rationale ?? "",
      alternatives: chart.alternatives ?? []
    },
    forecastModeActive: !!forecast.active,
    forecastMethod: forecast.method ?? null,
    steps: [],
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

/** Read `trace_payload_json.explainability` from a notebook cell API payload. */
export function traceFromCellPayloadJson(payload: Record<string, unknown> | undefined): TracePanelModel {
  if (!payload) return { ...EMPTY_TRACE };
  const exp = payload.explainability;
  if (exp && typeof exp === "object" && (exp as AnalyticsExplainabilityTraceV1Dto).schema_version === 1) {
    return mapV1(exp as AnalyticsExplainabilityTraceV1Dto);
  }
  return { ...EMPTY_TRACE };
}
