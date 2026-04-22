import type { Route } from "next";
import Link from "next/link";
import { AutoMLBulkApplyCard } from "@/components/dashboard/automl-bulk-apply-card";
import { AdminTilesGrid } from "@/components/dashboard/admin-tiles-grid";
import { AdminDemoFlows } from "@/components/dashboard/admin-demo-flows";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { SectionCard } from "@/components/dashboard/section-card";
import { DemoQuickActions } from "@/components/system/demo-quick-actions";
import { ADMIN_TILES } from "@/lib/dashboard/mock-data";

export default function AdminDashboardPage() {
  return (
    <div className="layout-page-stack">
      <DashboardHero
        eyebrow="Администрирование"
        title="Панель управления workspace"
        description="Настройка источников, семантики, доступа и аудита без выхода из аналитической платформы."
        trailing={
          <Link
            href={"/settings" as Route}
            className="rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-xs font-semibold text-foreground-secondary shadow-xs hover:border-brand-200 hover:text-brand-800"
          >
            Глобальные настройки
          </Link>
        }
      />
      <DemoQuickActions
        items={[
          { label: "Словарь", href: "/dictionary", hint: "Управление семантическими терминами и видимостью" },
          { label: "Шаблоны", href: "/templates", hint: "Стартовые наборы по ролям" },
          { label: "Загрузка данных", href: "/data-upload", hint: "Проверка guardrails загрузки" }
        ]}
      />

      <SectionCard
        title="Зоны администрирования"
        description="Быстрые переходы к ключевым разделам enterprise AI-аналитики."
      >
        <AdminTilesGrid tiles={ADMIN_TILES} />
      </SectionCard>

      <AdminDemoFlows />

      <AutoMLBulkApplyCard compact />

      <div className="rounded-card border border-border-subtle bg-surface-muted/50 px-4 py-3 text-xs text-foreground-secondary">
        <span className="font-semibold text-foreground">Workspace</span> · Все ссылки ведут в существующие разделы
        приложения (настройки, словарь, шаблоны, история, загрузка данных). Замените на role-gated API после готовности
        backend.
      </div>
    </div>
  );
}
