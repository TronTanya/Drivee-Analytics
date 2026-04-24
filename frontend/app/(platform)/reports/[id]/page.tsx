"use client";

import type { Route } from "next";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { SectionCard } from "@/components/dashboard/section-card";
import { SystemPageIntro } from "@/components/system/system-page-intro";
import { queryKeys } from "@/hooks/api/query-keys";
import { fetchSavedReportDetail } from "@/lib/api/reports";

export default function SavedReportDetailPage() {
  const params = useParams();
  const reportId = String(params.id ?? "");

  const q = useQuery({
    queryKey: queryKeys.reports.detail(reportId),
    queryFn: () => fetchSavedReportDetail(reportId),
    enabled: reportId.length > 0
  });

  const payload = (q.data?.report_payload_json ?? {}) as Record<string, unknown>;
  const schedule = q.data?.schedule ?? null;
  const emailMock =
    schedule &&
    typeof schedule === "object" &&
    (schedule as { delivery_channel?: string }).delivery_channel === "email_mock";

  return (
    <div className="space-y-6">
      <SystemPageIntro
        title={q.data?.title ?? "Отчёт"}
        subtitle="Сохранённый снимок запроса, SQL и результата. Расписание — с явной пометкой mock-доставки, если без SMTP."
      />
      <div className="flex flex-wrap gap-2">
        <Link href={"/reports" as Route} className="text-sm font-semibold text-brand-800 underline-offset-2 hover:underline">
          ← К списку отчётов
        </Link>
        {q.data?.notebook_id ? (
          <Link
            href={`/notebooks/${q.data.notebook_id}` as Route}
            className="text-sm font-semibold text-foreground-secondary underline-offset-2 hover:underline"
          >
            Открыть связанный сценарий
          </Link>
        ) : null}
      </div>

      {q.isLoading ? (
        <p className="text-sm text-foreground-secondary">Загружаем отчёт…</p>
      ) : null}
      {q.isError ? (
        <p className="rounded-card border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger-bold">
          Не удалось загрузить отчёт.
        </p>
      ) : null}

      {q.data ? (
        <>
          {emailMock ? (
            <div className="rounded-card border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
              <span className="font-semibold">Расписание (честная модель):</span> канал{" "}
              <code className="rounded bg-white/80 px-1">email_mock</code> — события пишутся только в{" "}
              <code className="rounded bg-white/80 px-1">delivery_config_json.mock_delivery_log</code>, без отправки
              писем.
            </div>
          ) : null}

          <SectionCard title="Метаданные">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-semibold uppercase text-foreground-muted">Создан</dt>
                <dd className="text-foreground-secondary">{q.data.created_at}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase text-foreground-muted">Роль автора (payload)</dt>
                <dd className="text-foreground-secondary">
                  {typeof payload.creator_role_key === "string" ? payload.creator_role_key : "—"}
                </dd>
              </div>
              {q.data.description ? (
                <div className="sm:col-span-2">
                  <dt className="text-[11px] font-semibold uppercase text-foreground-muted">Описание</dt>
                  <dd className="text-foreground-secondary">{q.data.description}</dd>
                </div>
              ) : null}
            </dl>
          </SectionCard>

          <SectionCard title="Исходный запрос и интерпретация">
            <p className="text-sm text-foreground">{String(payload.prompt ?? "—")}</p>
            {payload.interpreted_query ? (
              <p className="mt-2 text-xs text-foreground-secondary">
                <span className="font-semibold text-foreground-muted">Интерпретация: </span>
                {String(payload.interpreted_query)}
              </p>
            ) : null}
            {typeof payload.confidence === "number" ? (
              <p className="mt-1 text-xs text-foreground-muted">Confidence: {Math.round(payload.confidence * 100)}%</p>
            ) : null}
          </SectionCard>

          <SectionCard title="SQL">
            <pre className="surface-console max-h-64 overflow-auto p-3 font-mono text-[11px] text-foreground-secondary">
              {String(payload.generated_sql ?? "—")}
            </pre>
          </SectionCard>

          <SectionCard title="График (config)">
            <pre className="surface-console max-h-48 overflow-auto p-3 font-mono text-[11px]">
              {JSON.stringify(payload.chart_config ?? {}, null, 2)}
            </pre>
            {payload.chart_type ? (
              <p className="mt-2 text-xs text-foreground-muted">Тип графика: {String(payload.chart_type)}</p>
            ) : null}
          </SectionCard>

          <SectionCard title="Снимок результата (таблица)">
            <pre className="surface-console max-h-72 overflow-auto p-3 font-mono text-[11px]">
              {JSON.stringify(payload.result_snapshot ?? {}, null, 2)}
            </pre>
          </SectionCard>

          {schedule ? (
            <SectionCard title="Расписание">
              <pre className="surface-console max-h-56 overflow-auto p-3 font-mono text-[11px]">
                {JSON.stringify(schedule, null, 2)}
              </pre>
            </SectionCard>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
