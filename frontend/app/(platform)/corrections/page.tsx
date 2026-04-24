"use client";

import type { Route } from "next";
import Link from "next/link";
import { AdminCorrectionsQueue } from "@/components/dashboard/admin-corrections-queue";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";

export default function CorrectionsPage() {
  return (
    <div className="layout-page-stack">
      <DashboardHero
        eyebrow="Администрирование"
        title="Коррекции интерпретации"
        description="Очередь learned SQL-исправлений для семантики и NL→SQL. Доступно только роли admin (см. API /admin/corrections)."
        trailing={
          <Link
            href={"/dashboard/admin" as Route}
            className="rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-xs font-semibold text-foreground-secondary shadow-xs hover:border-brand-200 hover:text-brand-800"
          >
            К админ-дашборду
          </Link>
        }
      />
      <AdminCorrectionsQueue />
    </div>
  );
}
