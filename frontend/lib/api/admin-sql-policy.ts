import { apiFetchJson } from "@/lib/api/client";
import type { AdminSqlPolicyDto, AdminSqlPolicyUpdateDto } from "@/types/api/admin-sql-policy";

export async function fetchAdminSqlPolicy(): Promise<AdminSqlPolicyDto> {
  return apiFetchJson<AdminSqlPolicyDto>("/api/v1/admin/sql-policy");
}

export async function putAdminSqlPolicy(body: AdminSqlPolicyUpdateDto): Promise<AdminSqlPolicyDto> {
  return apiFetchJson<AdminSqlPolicyDto>("/api/v1/admin/sql-policy", {
    method: "PUT",
    body: JSON.stringify(body)
  });
}
