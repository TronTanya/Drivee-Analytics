import type { UserRole } from "@/lib/types";

export type NotebookStatusDto = "draft" | "active" | "archived";

export type NotebookListItemDto = {
  id: string;
  title: string;
  workspace_id?: string;
  owner_user_id?: string;
  notebook_status?: NotebookStatusDto | string;
  latest_cell_id?: string | null;
  created_at: string;
  updated_at?: string;
  role_hint?: UserRole;
};

export type NotebookDetailDto = NotebookListItemDto & {
  description?: string;
  tags?: string[];
};

export type CreateNotebookRequestDto = {
  title: string;
  description?: string;
  /** UUID workspace; на бэкенде подставится default workspace пользователя, если не передан */
  workspace_id?: string;
  role_hint?: UserRole;
};

export type UpdateNotebookRequestDto = Partial<CreateNotebookRequestDto> & {
  notebook_status?: NotebookStatusDto;
};

export type SaveNotebookScenarioRequestDto = {
  scenario_title: string;
  scenario_description?: string;
};

export type SaveNotebookResponseDto = {
  notebook_id: string;
  context_chain_json: Record<string, unknown>;
};
