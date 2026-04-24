import { ApiError } from "@/lib/api/client";
import { isApiMockFallback, isApiMockOnly, isDemoModeEnabled } from "@/lib/api/config";
import { requestJson } from "@/lib/api/request";
import { clearTokens, getAccessToken, setTokenPair } from "@/lib/api/token";
import { mockLogin, mockMe, mockPatchMyProfile, mockRegister } from "@/lib/api/mocks";
import type {
  AuthSessionDto,
  LoginRequestDto,
  RegisterRequestDto,
  UserDto,
  UserProfilePatchDto
} from "@/types/api/auth";

export async function login(body: LoginRequestDto): Promise<AuthSessionDto> {
  const tokens = await requestJson({
    path: "/api/v1/auth/login",
    init: { method: "POST", body: JSON.stringify(body) },
    mock: async () => (await mockLogin(body)).tokens
  });
  setTokenPair(tokens.access_token, tokens.refresh_token ?? null);
  const user = await fetchCurrentUser();
  return { user, tokens };
}

export async function register(body: RegisterRequestDto): Promise<AuthSessionDto> {
  const payload = {
    email: body.email,
    password: body.password,
    role: body.demo_role ?? "manager",
    is_demo: true
  };
  const tokens = await requestJson({
    path: "/api/v1/auth/register",
    init: { method: "POST", body: JSON.stringify(payload) },
    mock: async () => (await mockRegister(body)).tokens
  });
  setTokenPair(tokens.access_token, tokens.refresh_token ?? null);
  const user = await fetchCurrentUser();
  return { user, tokens };
}

export async function patchMyProfile(body: UserProfilePatchDto): Promise<UserDto> {
  return requestJson({
    path: "/api/v1/auth/me/profile",
    init: { method: "PATCH", body: JSON.stringify(body) },
    mock: () => mockPatchMyProfile(body),
    /** Мутации профиля не должны тихо уходить в mock при 401/404 — иначе UI показывает «сохранено», а данных на сервере нет. */
    allowFallback: false
  });
}

export async function fetchCurrentUser(): Promise<UserDto> {
  // В demo-режиме без JWT пробуем live /auth/me (backend вернёт demo-user через bypass),
  // и только при неуспехе деградируем в mock.
  if (typeof window !== "undefined" && !getAccessToken()) {
    if (isApiMockOnly()) {
      return mockMe();
    }
    if (!isDemoModeEnabled()) {
      if (isApiMockFallback()) return mockMe();
      throw new ApiError("Требуется вход", 401);
    }
  }
  return requestJson({
    path: "/api/v1/auth/me",
    init: { method: "GET" },
    mock: () => mockMe()
  });
}

export function logoutClient(): void {
  clearTokens();
}
