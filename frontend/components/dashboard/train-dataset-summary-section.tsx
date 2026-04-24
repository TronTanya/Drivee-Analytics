"use client";

import { KpiStatCard, type KpiMetric } from "@/components/dashboard/kpi-stat-card";
import { SectionCard } from "@/components/dashboard/section-card";
import { useTrainDatasetSummary } from "@/hooks/api/use-train-dataset-summary";
import { useMemo } from "react";

function fmtNumber(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

type Props = {
  workspaceId: string | undefined;
};

export function TrainDatasetSummarySection({ workspaceId }: Props) {
  const q = useTrainDatasetSummary(workspaceId);

  const kpis = useMemo<KpiMetric[]>(() => {
    const d = q.data;
    if (!d) return [];
    const windowParts = [d.order_timestamp_min, d.order_timestamp_max].filter(Boolean) as string[];
    const windowSub =
      windowParts.length === 2
        ? `${new Date(windowParts[0]).toLocaleDateString("ru-RU")} — ${new Date(windowParts[1]).toLocaleDateString("ru-RU")}`
        : "окно по order_timestamp в train";

    const base: KpiMetric[] = [
      { id: "rows", label: "Строки train", value: fmtNumber(d.train_row_count), sub: "заказ × тендер" },
      { id: "orders", label: "Уникальные заказы", value: fmtNumber(d.distinct_orders), sub: windowSub },
      { id: "done", label: "Завершённые поездки", value: fmtNumber(d.done_rides), sub: "driverdone_timestamp" },
      { id: "canc", label: "Отмены (все)", value: fmtNumber(d.cancellations_total), sub: "client + driver cancel" }
    ];
    if (typeof d.sum_order_price === "number" && Number.isFinite(d.sum_order_price)) {
      base.push({
        id: "rev",
        label: "Σ price_order_local",
        value: fmtMoney(d.sum_order_price),
        sub: "сумма по выборке train"
      });
    }
    return base;
  }, [q.data]);

  if (!workspaceId?.trim()) {
    return null;
  }

  if (q.isPending) {
    return (
      <SectionCard title="Канонический датасет" description="Загрузка агрегатов public.train…">
        <div className="text-sm text-foreground-secondary">…</div>
      </SectionCard>
    );
  }

  if (q.isError || !q.data) {
    return null;
  }

  const gridClass =
    kpis.length >= 5 ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-5" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <SectionCard
      title={`Канонический датасет (${q.data.source_table})`}
      description="Те же агрегаты, что доступны NL→SQL и отчётам; не смешивается с CSV-staging без явного контекста."
    >
      <div className={gridClass}>
        {kpis.map((m) => (
          <KpiStatCard key={m.id} metric={m} />
        ))}
      </div>
    </SectionCard>
  );
}
