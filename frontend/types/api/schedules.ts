export type ScheduleDto = {
  id: string;
  name: string;
  cron: string;
  timezone: string;
  target_type: "report" | "notebook_scenario" | "export";
  target_id: string;
  is_active: boolean;
  last_run_at?: string | null;
  next_run_at?: string | null;
};

export type UpsertScheduleRequestDto = {
  name: string;
  cron: string;
  timezone: string;
  target_type: ScheduleDto["target_type"];
  target_id: string;
  is_active: boolean;
};
