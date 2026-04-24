"use client";
import { useEffect, useState } from "react";
import { NotebookPageLayout } from "@/components/notebook/notebook-page-layout";
import { NotebooksHomeOverview, NotebooksHomeOverviewSkeleton } from "@/components/notebook/notebooks-home-overview";
import { useSession } from "@/lib/auth/session-context";

export default function NotebooksPage() {
  const { session } = useSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <NotebookPageLayout title="Обзор" subtitle="Сводка системы и доступных модулей по роли. Детальный список ноутбуков — в разделе «Сценарии».">
      {mounted ? <NotebooksHomeOverview role={session.role} /> : <NotebooksHomeOverviewSkeleton />}
    </NotebookPageLayout>
  );
}
