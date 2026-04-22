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

export type UserDto = {
  id: string;
  email: string;
  full_name?: string;
  role: UserRole;
  workspace_id?: string;
};

export type AuthSessionDto = {
  user: UserDto;
  tokens: TokenPairDto;
};
