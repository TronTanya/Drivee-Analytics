"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { UserRole } from "@/lib/types";

export type SessionState = {
  role: UserRole;
  email: string | null;
};

type SessionContextValue = {
  session: SessionState;
  setRole: (role: UserRole) => void;
  setEmail: (email: string | null) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

const defaultSession: SessionState = {
  role: "manager",
  email: null
};

const SESSION_STORAGE_KEY = "drivee.session.v1";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>(defaultSession);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SessionState>;
      const role = parsed.role;
      const email = typeof parsed.email === "string" ? parsed.email : null;
      if (role === "admin" || role === "manager" || role === "marketer" || role === "executive") {
        setSession({ role, email });
      }
    } catch {
      // Ignore malformed storage payloads.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Ignore storage errors in private mode/restricted environments.
    }
  }, [session]);

  const setRole = useCallback((role: UserRole) => {
    setSession((s) => ({ ...s, role }));
  }, []);

  const setEmail = useCallback((email: string | null) => {
    setSession((s) => ({ ...s, email }));
  }, []);

  const value = useMemo(
    () => ({
      session,
      setRole,
      setEmail
    }),
    [session, setRole, setEmail]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
}
