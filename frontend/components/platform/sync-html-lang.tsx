"use client";

import { useEffect } from "react";
import { useCurrentUser } from "@/hooks/api/use-auth";

/** Синхронизирует `lang` у `<html>` с локалью из профиля (доступность и перевод браузерных подсказок). */
export function SyncHtmlLang() {
  const me = useCurrentUser();
  useEffect(() => {
    const loc = me.data?.profile?.locale;
    if (loc === "en" || loc === "ru") {
      document.documentElement.lang = loc;
    }
  }, [me.data?.profile?.locale]);

  return null;
}
