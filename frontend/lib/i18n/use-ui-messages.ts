"use client";

import { useMemo } from "react";
import { useCurrentUser } from "@/hooks/api/use-auth";
import { type UiLocale, type UiMessageKey, uiMessage } from "@/lib/i18n/messages";

export function useUiLocale(): UiLocale {
  const me = useCurrentUser();
  return me.data?.profile?.locale === "en" ? "en" : "ru";
}

/** Переводы UI по локали из `/auth/me` → `profile.locale`. */
export function useUiMessages() {
  const locale = useUiLocale();
  return useMemo(() => (key: UiMessageKey) => uiMessage(locale, key), [locale]);
}
