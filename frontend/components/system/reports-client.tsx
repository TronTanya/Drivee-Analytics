"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/components/dashboard/section-card";
import { DemoQuickActions } from "@/components/system/demo-quick-actions";
import { ScheduleBadge } from "@/components/system/schedule-badge";
import { SystemPageIntro } from "@/components/system/system-page-intro";
import { SmartTooltip } from "@/components/ui/smart-tooltip";
import {
  useCreateReport,
  useDeleteReport,
  useNotebookScenarios,
  useRerunReport,
  useSavedReports
} from "@/hooks/api/use-reports";
import { downloadReportPdf, type ReportPdfMode } from "@/lib/api/reports";
import { getDefaultReportPdfMode } from "@/lib/preferences/report-pdf";
import { upsertReportSnapshot } from "@/lib/reports/local-snapshots";
import { useUpsertSchedule } from "@/hooks/api/use-schedules";
import { runAnalyticsPipeline } from "@/lib/api";
import type { NotebookScenarioRow, SavedReportRow, ScheduleState } from "@/lib/system/mock-data";

type KindFilter = "all" | "reports" | "scenarios";

function toScheduleState(value: string): ScheduleState {
  if (value === "active" || value === "paused" || value === "none") return value;
  return "none";
}

function toFormatLabel(value: string): SavedReportRow["format"] {
  if (value === "slides") return "Slides";
  if (value === "notebook") return "Notebook";
  if (value === "csv") return "CSV";
  return "PDF";
}

function IconBtn({
  children,
  title,
  onClick,
  variant = "neutral"
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  variant?: "neutral" | "danger";
}) {
  const cls =
    variant === "danger"
      ? "border-rose-200 text-rose-800 hover:bg-rose-50"
      : "border-border-subtle text-foreground-secondary hover:bg-surface-muted hover:text-foreground";

  return (
    <SmartTooltip
      content={title}
      estimatedWidth={224}
      panelWidthClassName="w-56 px-2 py-1"
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={title}
        className={`interactive-focus rounded-control border px-2 py-1 text-xs font-semibold transition ${cls}`}
      >
        {children}
      </button>
    </SmartTooltip>
  );
}

export function ReportsClient() {
  const [search, setSearch] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleState | "all">("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const savedReportsQuery = useSavedReports();
  const scenariosQuery = useNotebookScenarios();
  const [reports, setReports] = useState<SavedReportRow[]>([]);
  const [scenarios, setScenarios] = useState<NotebookScenarioRow[]>([]);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const rerunReport = useRerunReport();
  const createReport = useCreateReport();
  const deleteReport = useDeleteReport();
  const upsertSchedule = useUpsertSchedule();

  const mappedReports = useMemo(
    () =>
      (savedReportsQuery.data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        owner: r.owner_email ?? "demo@drivee.local",
        updatedAt: new Date(r.updated_at).toISOString().slice(0, 16).replace("T", " "),
        schedule: toScheduleState(r.schedule),
        format: toFormatLabel(r.format),
        href: "/reports" as Route
      })),
    [savedReportsQuery.data]
  );

  const mappedScenarios = useMemo(
    () =>
      (scenariosQuery.data ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        notebookId: s.notebook_id,
        owner: s.owner_email ?? "demo@drivee.local",
        updatedAt: new Date(s.updated_at).toISOString().slice(0, 16).replace("T", " "),
        schedule: toScheduleState(s.schedule),
        href: (`/notebooks/${s.notebook_id}` as Route)
      })),
    [scenariosQuery.data]
  );

  useEffect(() => {
    setReports(mappedReports);
  }, [mappedReports]);

  useEffect(() => {
    setScenarios(mappedScenarios);
  }, [mappedScenarios]);

  const downloadPdf = async (title: string, sourceId: string, mode: ReportPdfMode) => {
    setActionMsg(null);
    setBusyKey(`report-download-${sourceId}-${mode}`);
    try {
      const blob = await downloadReportPdf(sourceId, title, mode);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^\p{L}\p{N}\-_ ]/gu, "").replace(/\s+/g, "_") || "report"}-${mode}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setActionMsg(`PDF отчета "${title}" скачан (${mode}).`);
    } catch {
      setActionMsg(`Не удалось скачать PDF отчета "${title}" (${mode}).`);
    } finally {
      setBusyKey(null);
    }
  };

  const downloadPdfDefault = async (title: string, sourceId: string) => {
    await downloadPdf(title, sourceId, getDefaultReportPdfMode());
  };

  const nextSchedule = (current: ScheduleState): ScheduleState => {
    if (current === "active") return "paused";
    if (current === "paused") return "none";
    return "active";
  };

  const scheduleToIsActive = (state: ScheduleState): boolean => state === "active";

  const onRerunReport = async (row: SavedReportRow) => {
    setActionMsg(null);
    setBusyKey(`report-rerun-${row.id}`);
    try {
      await rerunReport.mutateAsync(row.id);
      setActionMsg(`Отчет "${row.name}" поставлен в очередь на обновление.`);
    } catch {
      setActionMsg(`Не удалось перезапустить отчет "${row.name}".`);
    } finally {
      setBusyKey(null);
    }
  };

  const onEditReportSchedule = async (row: SavedReportRow) => {
    setActionMsg(null);
    setBusyKey(`report-edit-${row.id}`);
    const updated = nextSchedule(row.schedule);
    try {
      await upsertSchedule.mutateAsync({
        name: `Расписание отчета ${row.name}`,
        cron: "0 9 * * 1",
        timezone: "Asia/Almaty",
        target_type: "report",
        target_id: row.id,
        is_active: scheduleToIsActive(updated)
      });
      setReports((prev) => prev.map((x) => (x.id === row.id ? { ...x, schedule: updated } : x)));
      setActionMsg(`Расписание отчета "${row.name}" обновлено.`);
    } catch {
      setActionMsg(`Не удалось обновить расписание отчета "${row.name}".`);
    } finally {
      setBusyKey(null);
    }
  };

  const onDeleteReport = async (row: SavedReportRow) => {
    if (!confirm(`Удалить отчет «${row.name}»?`)) return;
    setActionMsg(null);
    setBusyKey(`report-delete-${row.id}`);
    try {
      await deleteReport.mutateAsync(row.id);
      setReports((r) => r.filter((x) => x.id !== row.id));
      setActionMsg(`Отчет "${row.name}" удален.`);
    } catch {
      setActionMsg(`Не удалось удалить отчет "${row.name}".`);
    } finally {
      setBusyKey(null);
    }
  };

  const onRerunScenario = async (row: NotebookScenarioRow) => {
    setActionMsg(null);
    setBusyKey(`scenario-rerun-${row.id}`);
    try {
      await runAnalyticsPipeline(row.notebookId, "Обновить ключевые метрики сценария");
      setActionMsg(`Сценарий "${row.name}" перезапущен.`);
    } catch {
      setActionMsg(`Не удалось перезапустить сценарий "${row.name}".`);
    } finally {
      setBusyKey(null);
    }
  };

  const onMakeReportFromScenario = async (row: NotebookScenarioRow) => {
    setActionMsg(null);
    setBusyKey(`scenario-report-${row.id}`);
    try {
      const created = await createReport.mutateAsync({
        name: `Отчет: ${row.name}`,
        format: "pdf",
        notebook_id: row.notebookId
      });
      upsertReportSnapshot({
        report_id: created.id,
        report_name: created.name,
        notebook_id: row.notebookId,
        prompt: "Scenario-based report export",
        insight: `Report created from scenario "${row.name}"`,
        created_at: new Date().toISOString()
      });
      setReports((prev) => [
        {
          id: created.id,
          name: created.name,
          owner: created.owner_email ?? row.owner,
          updatedAt: new Date(created.updated_at).toISOString().slice(0, 16).replace("T", " "),
          schedule: "none",
          format: "PDF",
          href: "/reports" as Route
        },
        ...prev
      ]);
      setActionMsg(`Отчет "${created.name}" создан из сценария.`);
    } catch {
      setActionMsg(`Не удалось создать отчет из сценария "${row.name}".`);
    } finally {
      setBusyKey(null);
    }
  };

  const onEditScenario = async (row: NotebookScenarioRow) => {
    setActionMsg(null);
    setBusyKey(`scenario-edit-${row.id}`);
    const updated = nextSchedule(row.schedule);
    try {
      await upsertSchedule.mutateAsync({
        name: `Расписание сценария ${row.name}`,
        cron: "0 8 * * 1-5",
        timezone: "Asia/Almaty",
        target_type: "notebook_scenario",
        target_id: row.id,
        is_active: scheduleToIsActive(updated)
      });
      setScenarios((prev) => prev.map((x) => (x.id === row.id ? { ...x, schedule: updated } : x)));
      setActionMsg(`Расписание сценария "${row.name}" обновлено.`);
    } catch {
      setActionMsg(`Не удалось обновить сценарий "${row.name}".`);
    } finally {
      setBusyKey(null);
    }
  };

  const filterRow = <T extends { name: string; schedule: ScheduleState }>(rows: T[]) =>
    rows.filter(
      (row) =>
        row.name.toLowerCase().includes(search.toLowerCase()) &&
        (scheduleFilter === "all" || row.schedule === scheduleFilter)
    );

  const filteredReports = useMemo(() => filterRow(reports), [reports, search, scheduleFilter]);
  const filteredScenarios = useMemo(() => filterRow(scenarios), [scenarios, search, scheduleFilter]);

  const showReports = kind === "all" || kind === "reports";
  const showScenarios = kind === "all" || kind === "scenarios";

  return (
    <div className="space-y-6">
      <SystemPageIntro
        title="Отчеты и сценарии"
        subtitle="Сохраненные результаты, обновления по расписанию и сценарии на основе сценариев. Фильтры применяются к обоим спискам."
      />
      <DemoQuickActions
        items={[
          { label: "Открыть список сценариев", href: "/notebooks", hint: "Начать из сценария" },
          { label: "История запусков", href: "/history", hint: "Проверить недавние запуски" },
          { label: "Шаблоны", href: "/templates", hint: "Использовать ролевые шаблоны" }
        ]}
      />
      {savedReportsQuery.isLoading || scenariosQuery.isLoading ? (
        <div className="rounded-card border border-border-subtle bg-surface-card px-4 py-3 text-sm text-foreground-secondary">
          Загружаем отчеты и сценарии...
        </div>
      ) : null}
      {savedReportsQuery.isError || scenariosQuery.isError ? (
        <div className="rounded-card border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger-bold">
          Не удалось загрузить часть данных. Продолжаем в fallback-режиме.
        </div>
      ) : null}
      {actionMsg ? (
        <div className="rounded-card border border-border-subtle bg-surface-card px-4 py-3 text-sm text-foreground-secondary">
          {actionMsg}
        </div>
      ) : null}

      <div className="surface-section flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-0 flex-1 sm:min-w-[200px]">
          <label htmlFor="rep-search" className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
            Поиск
          </label>
          <input
            id="rep-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Название содержит…"
            className="interactive-focus mt-1 w-full rounded-control border border-border-subtle bg-surface-page px-3 py-2 text-sm focus:border-brand-400"
          />
        </div>
        <div>
          <label htmlFor="rep-sched" className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
            Расписание
          </label>
          <select
            id="rep-sched"
            value={scheduleFilter}
            onChange={(e) => setScheduleFilter(e.target.value as ScheduleState | "all")}
            className="interactive-focus mt-1 w-full rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-sm sm:w-40"
          >
            <option value="all">Все</option>
            <option value="active">Активно</option>
            <option value="paused">Пауза</option>
            <option value="none">Вручную</option>
          </select>
        </div>
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Показывать</span>
          <div className="mt-1 flex rounded-control border border-border-subtle bg-surface-muted p-0.5">
            {(
              [
                ["all", "Все"],
                ["reports", "Отчеты"],
                ["scenarios", "Сценарии"]
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setKind(key)}
                aria-pressed={kind === key}
                className={`interactive-focus rounded-[6px] px-2.5 py-1.5 text-xs font-semibold ${
                  kind === key ? "bg-surface-card text-brand-800 shadow-xs" : "text-foreground-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showReports ? (
        <SectionCard title="Сохраненные отчеты" description="Экспорты и готовые к публикации артефакты.">
          <div className="space-y-3 md:hidden">
            {filteredReports.map((row) => (
              <article key={row.id} className="surface-content space-y-3 px-3 py-3">
                <div className="space-y-1">
                  <Link
                    href={row.href as Route}
                    className="interactive-focus inline-flex rounded-control px-0.5 text-sm font-semibold text-foreground hover:text-brand-800 hover:underline"
                  >
                    {row.name}
                  </Link>
                  <p className="text-xs text-foreground-secondary">{row.owner}</p>
                  <p className="text-xs tabular-nums text-foreground-muted">{row.updatedAt}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium">{row.format}</span>
                  <ScheduleBadge state={row.schedule} />
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  <IconBtn title="Перезапустить обновление" onClick={() => onRerunReport(row)}>
                    {busyKey === `report-rerun-${row.id}` ? "Перезапуск..." : "Перезапуск"}
                  </IconBtn>
                  <IconBtn title="Изменить расписание" onClick={() => onEditReportSchedule(row)}>
                    {busyKey === `report-edit-${row.id}` ? "Сохранение..." : "Изменить"}
                  </IconBtn>
                  <IconBtn title="Скачать PDF по умолчанию" onClick={() => void downloadPdfDefault(row.name, row.id)}>
                    {busyKey === `report-download-${row.id}-compact` || busyKey === `report-download-${row.id}-board`
                      ? "Скачивание..."
                      : "PDF по умолчанию"}
                  </IconBtn>
                  <div className="grid grid-cols-2 gap-1.5">
                    <IconBtn title="Скачать PDF compact" onClick={() => void downloadPdf(row.name, row.id, "compact")}>
                      {busyKey === `report-download-${row.id}-compact` ? "Скачивание..." : "PDF compact"}
                    </IconBtn>
                    <IconBtn title="Скачать PDF board" onClick={() => void downloadPdf(row.name, row.id, "board")}>
                      {busyKey === `report-download-${row.id}-board` ? "Скачивание..." : "PDF board"}
                    </IconBtn>
                  </div>
                  <IconBtn title="Удалить" variant="danger" onClick={() => onDeleteReport(row)}>
                    {busyKey === `report-delete-${row.id}` ? "Удаление..." : "Удалить"}
                  </IconBtn>
                </div>
              </article>
            ))}
            {filteredReports.length === 0 ? (
              <p className="py-4 text-center text-sm text-foreground-muted">Нет отчетов по заданным фильтрам.</p>
            ) : null}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] border-collapse text-left text-body-sm">
              <thead>
                <tr className="border-b border-border-subtle text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                  <th className="pb-2 pr-4">Название</th>
                  <th className="pb-2 pr-4">Владелец</th>
                  <th className="pb-2 pr-4">Обновлено</th>
                  <th className="pb-2 pr-4">Формат</th>
                  <th className="pb-2 pr-4">Расписание</th>
                  <th className="pb-2 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filteredReports.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-muted/40">
                    <td className="py-3 pr-4 font-medium text-foreground">
                      <Link href={row.href as Route} className="interactive-focus rounded-control px-0.5 hover:text-brand-800 hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-foreground-secondary">{row.owner}</td>
                    <td className="py-3 pr-4 tabular-nums text-foreground-secondary">{row.updatedAt}</td>
                    <td className="py-3 pr-4">
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium">{row.format}</span>
                    </td>
                    <td className="py-3 pr-4">
                      <ScheduleBadge state={row.schedule} />
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <IconBtn title="Перезапустить обновление" onClick={() => onRerunReport(row)}>
                          {busyKey === `report-rerun-${row.id}` ? "Перезапуск..." : "Перезапуск"}
                        </IconBtn>
                        <IconBtn title="Изменить расписание" onClick={() => onEditReportSchedule(row)}>
                          {busyKey === `report-edit-${row.id}` ? "Сохранение..." : "Изменить"}
                        </IconBtn>
                        <IconBtn title="Скачать PDF по умолчанию" onClick={() => void downloadPdfDefault(row.name, row.id)}>
                          {busyKey === `report-download-${row.id}-compact` || busyKey === `report-download-${row.id}-board`
                            ? "Скачивание..."
                            : "PDF по умолчанию"}
                        </IconBtn>
                        <IconBtn title="Скачать PDF compact" onClick={() => void downloadPdf(row.name, row.id, "compact")}>
                          {busyKey === `report-download-${row.id}-compact` ? "Скачивание..." : "PDF compact"}
                        </IconBtn>
                        <IconBtn title="Скачать PDF board" onClick={() => void downloadPdf(row.name, row.id, "board")}>
                          {busyKey === `report-download-${row.id}-board` ? "Скачивание..." : "PDF board"}
                        </IconBtn>
                        <IconBtn
                          title="Удалить"
                          variant="danger"
                          onClick={() => onDeleteReport(row)}
                        >
                          {busyKey === `report-delete-${row.id}` ? "Удаление..." : "Удалить"}
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredReports.length === 0 ? (
              <p className="py-6 text-center text-sm text-foreground-muted">Нет отчетов по заданным фильтрам.</p>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {showScenarios ? (
        <SectionCard title="Сохраненные сценарии" description="Закрепленные конфигурации сценариев с опциональным расписанием.">
          <div className="space-y-3 md:hidden">
            {filteredScenarios.map((row) => (
              <article key={row.id} className="surface-content space-y-3 px-3 py-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">{row.name}</p>
                  <Link
                    href={row.href as Route}
                    className="interactive-focus inline-flex rounded-control px-0.5 font-mono text-xs text-brand-700 hover:underline"
                  >
                    {row.notebookId}
                  </Link>
                  <p className="text-xs text-foreground-secondary">{row.owner}</p>
                  <p className="text-xs tabular-nums text-foreground-muted">{row.updatedAt}</p>
                </div>
                <ScheduleBadge state={row.schedule} />
                <div className="grid grid-cols-1 gap-1.5">
                  <IconBtn title="Перезапустить сценарий" onClick={() => onRerunScenario(row)}>
                    {busyKey === `scenario-rerun-${row.id}` ? "Выполняется..." : "Перезапуск"}
                  </IconBtn>
                  <IconBtn title="Изменить" onClick={() => onEditScenario(row)}>
                    {busyKey === `scenario-edit-${row.id}` ? "Сохранение..." : "Изменить"}
                  </IconBtn>
                  <IconBtn title="Сделать отчет" onClick={() => onMakeReportFromScenario(row)}>
                    {busyKey === `scenario-report-${row.id}` ? "Создание..." : "Сделать отчет"}
                  </IconBtn>
                  <IconBtn
                    variant="danger"
                    title="Удалить"
                    onClick={() => {
                      if (confirm(`Удалить сценарий «${row.name}»?`)) setScenarios((s) => s.filter((x) => x.id !== row.id));
                    }}
                  >
                    Удалить
                  </IconBtn>
                </div>
              </article>
            ))}
            {filteredScenarios.length === 0 ? (
              <p className="py-4 text-center text-sm text-foreground-muted">Нет сценариев по заданным фильтрам.</p>
            ) : null}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] border-collapse text-left text-body-sm">
              <thead>
                <tr className="border-b border-border-subtle text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                  <th className="pb-2 pr-4">Название</th>
                  <th className="pb-2 pr-4">Сценарий</th>
                  <th className="pb-2 pr-4">Владелец</th>
                  <th className="pb-2 pr-4">Обновлено</th>
                  <th className="pb-2 pr-4">Расписание</th>
                  <th className="pb-2 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filteredScenarios.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-muted/40">
                    <td className="py-3 pr-4 font-medium text-foreground">{row.name}</td>
                    <td className="py-3 pr-4">
                      <Link href={row.href as Route} className="interactive-focus rounded-control px-0.5 font-mono text-xs text-brand-700 hover:underline">
                        {row.notebookId}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-foreground-secondary">{row.owner}</td>
                    <td className="py-3 pr-4 tabular-nums text-foreground-secondary">{row.updatedAt}</td>
                    <td className="py-3 pr-4">
                      <ScheduleBadge state={row.schedule} />
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <IconBtn title="Перезапустить сценарий" onClick={() => onRerunScenario(row)}>
                          {busyKey === `scenario-rerun-${row.id}` ? "Выполняется..." : "Перезапуск"}
                        </IconBtn>
                        <IconBtn title="Изменить" onClick={() => onEditScenario(row)}>
                          {busyKey === `scenario-edit-${row.id}` ? "Сохранение..." : "Изменить"}
                        </IconBtn>
                        <IconBtn title="Сделать отчет" onClick={() => onMakeReportFromScenario(row)}>
                          {busyKey === `scenario-report-${row.id}` ? "Создание..." : "Сделать отчет"}
                        </IconBtn>
                        <IconBtn
                          variant="danger"
                          title="Удалить"
                          onClick={() => {
                            if (confirm(`Удалить сценарий «${row.name}»?`))
                              setScenarios((s) => s.filter((x) => x.id !== row.id));
                          }}
                        >
                          Удалить
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredScenarios.length === 0 ? (
              <p className="py-6 text-center text-sm text-foreground-muted">Нет сценариев по заданным фильтрам.</p>
            ) : null}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
