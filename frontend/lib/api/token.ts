const ACCESS = "access_token";
const REFRESH = "refresh_token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS);
}

export function setAccessToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(ACCESS, token);
  else localStorage.removeItem(ACCESS);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH);
}

export function setRefreshToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(REFRESH, token);
  else localStorage.removeItem(REFRESH);
}

export function setTokenPair(access: string, refresh?: string | null): void {
  setAccessToken(access);
  if (refresh !== undefined) setRefreshToken(refresh);
}

export function clearTokens(): void {
  setAccessToken(null);
  setRefreshToken(null);
}
