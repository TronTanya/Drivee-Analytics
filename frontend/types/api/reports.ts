export type ReportFormatDto = "pdf" | "slides" | "notebook" | "csv";

export type ScheduleStateDto = "active" | "paused" | "none";

export type SavedReportDto = {
  id: string;
  name: string;
  owner_user_id?: string;
  owner_email?: string;
  updated_at: string;
  schedule: ScheduleStateDto;
  format: ReportFormatDto;
  notebook_id?: string | null;
  download_url?: string | null;
};

export type NotebookScenarioDto = {
  id: string;
  name: string;
  notebook_id: string;
  owner_user_id?: string;
  owner_email?: string;
  updated_at: string;
  schedule: ScheduleStateDto;
};

export type CreateReportRequestDto = {
  name: string;
  format: ReportFormatDto;
  notebook_id?: string;
};
