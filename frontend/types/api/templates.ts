import type { UserRole } from "@/lib/types";

export type QueryTemplateDto = {
  id: string;
  /** Заголовок карточки (как правило совпадает с name). */
  title?: string;
  name: string;
  description: string;
  role: UserRole;
  /** NL-вопрос для запуска pipeline в сценарии. */
  question?: string;
  /** Ожидаемый тип графика в ответе оркестратора. */
  expected_chart?: string;
  /** Зачем этот шаблон бизнесу (1–2 предложения). */
  business_value?: string;
  tags?: string[];
  /** Можно безопасно переиспользовать как стартовый сценарий. */
  reusable_scenario?: boolean;
  sql: string;
  default_notebook_id?: string;
  template_key?: string;
  nl_prompt_template?: string;
  sql_template?: string | null;
  default_chart_type?: string;
  /** null / undefined — шаблон общий для всех ролей в каталоге */
  target_role_key?: string | null;
};

export type NotebookTemplateDto = {
  id: string;
  name: string;
  description: string;
  role: UserRole;
  notebook_id: string;
};

export type QuickRunTemplateResultDto = {
  template_id: string;
  execution_status: string;
  safe_sql: string;
  insight: string;
  chart_type: string;
  warnings?: string[];
  table_records?: Array<Record<string, unknown>>;
  interpreted_intent?: string;
  trace_summary?: string;
  explainability_trace?: string[];
};
