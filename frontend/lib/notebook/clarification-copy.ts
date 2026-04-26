/** Единые подписи к кодам clarification_reason (бэкенд + mock). */

export function clarificationReasonSummaryRu(code: string): string {
  const c = code.trim();
  if (!c) return "";
  const map: Record<string, string> = {
    llm_detected_ambiguity: "Модель отметила несколько допустимых трактовок запроса.",
    revenue_definition_ambiguous: "Под запрос подходят разные определения выручки.",
    best_metric_unspecified: "Не выбрана метрика для понятия «лучшие» или для рейтинга.",
    city_scope_ambiguous: "Неясно: сравнивать по всем городам или сфокусироваться на одном.",
    scope_conflict_network_vs_city: "Одновременно указаны охват «вся сеть» и группировка по городам.",
    low_interpretation_confidence: "Низкая уверенность интерпретации — нужны уточнения.",
    comparison_baseline_unspecified: "Не задана база или период для сравнения «с прошлым».",
    ranking_metric_unspecified: "Не указана метрика, по которой ранжировать.",
    sales_metric_unspecified: "Не определено, что считать продажами.",
    effectiveness_metric_unspecified: "Не выбран показатель эффективности.",
    trend_metric_unspecified: "Не выбрана метрика для динамики.",
    time_grain_unspecified: "Не задан горизонт или шаг агрегации по времени.",
    summary_metric_unspecified: "Не выбрана метрика для сводки.",
    comparison_dimension_unspecified: "Не указано измерение или объект сравнения."
  };
  return map[c] ?? c.replace(/_/g, " ");
}
