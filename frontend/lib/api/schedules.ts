import { requestJson } from "@/lib/api/request";
import { mockListSchedules } from "@/lib/api/mocks";
import type { ScheduleDto, UpsertScheduleRequestDto } from "@/types/api/schedules";

export async function fetchSchedules(): Promise<ScheduleDto[]> {
  return requestJson({
    path: "/api/v1/schedules",
    init: { method: "GET", cache: "no-store" },
    mock: () => mockListSchedules()
  });
}

export async function upsertSchedule(body: UpsertScheduleRequestDto & { id?: string }): Promise<ScheduleDto> {
  const { id, ...rest } = body;
  const isUpdate = Boolean(id);
  return requestJson({
    path: isUpdate ? `/api/v1/schedules/${encodeURIComponent(id!)}` : "/api/v1/schedules",
    init: {
      method: isUpdate ? "PATCH" : "POST",
      body: JSON.stringify(rest)
    },
    mock: async () => ({
      id: id ?? `sch-${Date.now()}`,
      name: rest.name,
      cron: rest.cron,
      timezone: rest.timezone,
      target_type: rest.target_type,
      target_id: rest.target_id,
      is_active: rest.is_active
    })
  });
}
