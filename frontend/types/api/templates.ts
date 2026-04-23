import type { UserRole } from "@/lib/types";

export type QueryTemplateDto = {
  id: string;
  name: string;
  description: string;
  role: UserRole;
  sql: string;
  default_notebook_id?: string;
  template_key?: string;
  nl_prompt_template?: string;
  sql_template?: string | null;
  default_chart_type?: string;
};

export type NotebookTemplateDto = {
  id: string;
  name: string;
  description: string;
  role: UserRole;
  notebook_id: string;
};
