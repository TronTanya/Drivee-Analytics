import { ApiError } from "@/lib/api/client";
import { isApiMockFallback, isApiMockOnly } from "@/lib/api/config";
import { requestJson } from "@/lib/api/request";
import { clearTokens, getAccessToken, setTokenPair } from "@/lib/api/token";
import { mockLogin, mockMe, mockRegister } from "@/lib/api/mocks";
import type { AuthSessionDto, LoginRequestDto, RegisterRequestDto, UserDto } from "@/types/api/auth";

export async function login(body: LoginRequestDto): Promise<AuthSessionDto> {
  const session = await requestJson({
    path: "/api/v1/auth/login",
    init: { method: "POST", body: JSON.stringify(body) },
    mock: () => mockLogin(body)
  });
  setTokenPair(session.tokens.access_token, session.tokens.refresh_token ?? null);
  return session;
}

export async function register(body: RegisterRequestDto): Promise<AuthSessionDto> {
  const session = await requestJson({
    path: "/api/v1/auth/register",
    init: { method: "POST", body: JSON.stringify(body) },
    mock: () => mockRegister(body)
  });
  setTokenPair(session.tokens.access_token, session.tokens.refresh_token ?? null);
  return session;
}

export async function fetchCurrentUser(): Promise<UserDto> {
  // Без JWT не вызываем сеть: иначе браузер сыплет 401 в консоль, а fallback всё равно подставит мок.
  if (typeof window !== "undefined" && !getAccessToken()) {
    if (isApiMockOnly() || isApiMockFallback()) {
      return mockMe();
    }
    throw new ApiError("Требуется вход", 401);
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
