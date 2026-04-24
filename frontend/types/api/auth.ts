import type { ReportPdfMode } from "@/lib/preferences/report-pdf";
import type { UserRole } from "@/lib/types";

export type LoginRequestDto = {
  email: string;
  password: string;
};

export type RegisterRequestDto = {
  email: string;
  password: string;
  full_name: string;
  demo_role?: UserRole;
};

export type TokenPairDto = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
};

export type UserProfileDto = {
  first_name: string | null;
  last_name: string | null;
  timezone: string;
  locale: string;
  default_report_pdf_mode: ReportPdfMode;
};

/** Частичное обновление профиля (PATCH `/auth/me/profile`). */
export type UserProfilePatchDto = Partial<{
  first_name: string | null;
  last_name: string | null;
  timezone: string;
  locale: string;
  default_report_pdf_mode: ReportPdfMode;
}>;

export type UserDto = {
  id: string;
  email: string;
  full_name?: string;
  role: UserRole;
  workspace_id?: string;
  /** Соответствует backend `UserMeResponse.default_workspace_id`. */
  default_workspace_id?: string | null;
  profile: UserProfileDto;
};

export type AuthSessionDto = {
  user: UserDto;
  tokens: TokenPairDto;
};
