"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdminSqlPolicySection } from "@/components/system/admin-sql-policy-section";
import { SystemPageIntro } from "@/components/system/system-page-intro";
import { useCurrentUser, usePatchMyProfile } from "@/hooks/api/use-auth";
import { queryKeys } from "@/hooks/api/query-keys";
import { ApiError } from "@/lib/api/client";
import { useUiMessages } from "@/lib/i18n/use-ui-messages";
import { TIMEZONE_PRESETS } from "@/lib/preferences/timezone-presets";
import { getDefaultReportPdfMode, setDefaultReportPdfMode, type ReportPdfMode } from "@/lib/preferences/report-pdf";
import type { UserDto } from "@/types/api/auth";

const INPUT_CLASS =
  "w-full rounded-control border border-border-subtle bg-surface-card px-3 py-2.5 text-sm text-foreground shadow-xs placeholder:text-foreground-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/25";

function applyProfileToForm(user: UserDto, setters: {
  setFirstName: (v: string) => void;
  setLastName: (v: string) => void;
  setTimezone: (v: string) => void;
  setLocale: (v: string) => void;
  setPdfMode: (v: ReportPdfMode) => void;
}) {
  const p = user.profile;
  setters.setFirstName(p.first_name ?? "");
  setters.setLastName(p.last_name ?? "");
  setters.setTimezone(p.timezone || "UTC");
  setters.setLocale(p.locale || "ru");
  setters.setPdfMode(p.default_report_pdf_mode);
}

export function SettingsClient() {
  const qc = useQueryClient();
  const me = useCurrentUser();
  const patch = usePatchMyProfile();
  const t = useUiMessages();
  const hydratedForUserId = useRef<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [locale, setLocale] = useState("ru");
  const [pdfMode, setPdfMode] = useState<ReportPdfMode>(() => getDefaultReportPdfMode());
  const [savedProfile, setSavedProfile] = useState(false);
  const [savedPdf, setSavedPdf] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const user = me.data;
    if (!user?.profile) {
      hydratedForUserId.current = null;
      return;
    }
    if (hydratedForUserId.current === user.id) return;
    hydratedForUserId.current = user.id;
    applyProfileToForm(user, {
      setFirstName,
      setLastName,
      setTimezone,
      setLocale,
      setPdfMode
    });
  }, [me.data]);

  const pdfHelp = useMemo(
    () => (pdfMode === "board" ? t("settings_pdf_help_board") : t("settings_pdf_help_compact")),
    [pdfMode, t]
  );

  const busy = me.isLoading || patch.isPending;

  const onSaveProfile = async () => {
    setFormError(null);
    setSavedProfile(false);
    setSavedPdf(false);
    try {
      const user = await patch.mutateAsync({
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        timezone: timezone.trim() || "UTC",
        locale: locale.trim() || "ru"
      });
      applyProfileToForm(user, {
        setFirstName,
        setLastName,
        setTimezone,
        setLocale,
        setPdfMode
      });
      setSavedProfile(true);
    } catch (e) {
      if (e instanceof ApiError) {
        setFormError(e.message || t("settings_save_profile_error"));
      } else {
        setFormError(t("settings_save_profile_error"));
      }
    }
  };

  const onLocaleSelectChange = async (next: string) => {
    setFormError(null);
    setSavedProfile(false);
    setSavedPdf(false);
    const prev = locale;
    const prevMe = qc.getQueryData<UserDto>(queryKeys.auth.me());
    if (prevMe?.profile) {
      qc.setQueryData(queryKeys.auth.me(), {
        ...prevMe,
        profile: { ...prevMe.profile, locale: next }
      });
    }
    setLocale(next);
    try {
      const user = await patch.mutateAsync({ locale: next });
      applyProfileToForm(user, {
        setFirstName,
        setLastName,
        setTimezone,
        setLocale,
        setPdfMode
      });
      setSavedProfile(true);
    } catch (e) {
      if (prevMe) {
        qc.setQueryData(queryKeys.auth.me(), prevMe);
      }
      setLocale(prev);
      if (e instanceof ApiError) {
        setFormError(e.message || t("settings_save_profile_error"));
      } else {
        setFormError(t("settings_save_profile_error"));
      }
    }
  };

  const selectPdfMode = async (m: ReportPdfMode) => {
    if (patch.isPending) return;
    setFormError(null);
    setSavedProfile(false);
    setSavedPdf(false);
    const prev = pdfMode;
    setPdfMode(m);
    try {
      const user = await patch.mutateAsync({ default_report_pdf_mode: m });
      setDefaultReportPdfMode(user.profile.default_report_pdf_mode);
      setPdfMode(user.profile.default_report_pdf_mode);
      setSavedPdf(true);
    } catch (e) {
      setPdfMode(prev);
      if (e instanceof ApiError) {
        setFormError(e.message || t("settings_pdf_save_error"));
      } else {
        setFormError(t("settings_pdf_save_error"));
      }
    }
  };

  return (
    <div className="space-y-6">
      <SystemPageIntro title={t("settings_page_title")} subtitle={t("settings_page_subtitle")} />

      {formError ? (
        <div className="rounded-card border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{formError}</div>
      ) : null}

      <section className="rounded-card border border-border-subtle bg-surface-card p-5 shadow-xs">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">{t("settings_section_profile")}</p>
        <p className="mt-1 text-sm text-foreground-secondary">{t("settings_profile_hint")}</p>

        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void onSaveProfile();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="settings-first-name" className="text-xs font-semibold text-foreground-secondary">
                {t("settings_first_name")}
              </label>
              <input
                id="settings-first-name"
                type="text"
                autoComplete="given-name"
                disabled={busy}
                value={firstName}
                onChange={(e) => {
                  setSavedProfile(false);
                  setSavedPdf(false);
                  setFirstName(e.target.value);
                }}
                className={`${INPUT_CLASS} mt-1`}
              />
            </div>
            <div>
              <label htmlFor="settings-last-name" className="text-xs font-semibold text-foreground-secondary">
                {t("settings_last_name")}
              </label>
              <input
                id="settings-last-name"
                type="text"
                autoComplete="family-name"
                disabled={busy}
                value={lastName}
                onChange={(e) => {
                  setSavedProfile(false);
                  setSavedPdf(false);
                  setLastName(e.target.value);
                }}
                className={`${INPUT_CLASS} mt-1`}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="settings-timezone" className="text-xs font-semibold text-foreground-secondary">
                {t("settings_timezone_label")}
              </label>
              <input
                id="settings-timezone"
                type="text"
                list="timezone-presets"
                autoComplete="off"
                placeholder="Europe/Moscow"
                disabled={busy}
                value={timezone}
                onChange={(e) => {
                  setSavedProfile(false);
                  setSavedPdf(false);
                  setTimezone(e.target.value);
                }}
                className={`${INPUT_CLASS} mt-1`}
              />
              <datalist id="timezone-presets">
                {TIMEZONE_PRESETS.map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-foreground-muted">{t("settings_timezone_hint")}</p>
            </div>
            <div>
              <label htmlFor="settings-locale" className="text-xs font-semibold text-foreground-secondary">
                {t("settings_locale_label")}
              </label>
              <select
                id="settings-locale"
                disabled={busy}
                value={locale}
                onChange={(e) => void onLocaleSelectChange(e.target.value)}
                className={`${INPUT_CLASS} mt-1`}
              >
                <option value="ru">{t("settings_locale_option_ru")}</option>
                <option value="en">{t("settings_locale_option_en")}</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="mt-5 rounded-control border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
          >
            {patch.isPending ? t("settings_saving") : t("settings_save_profile")}
          </button>
          {savedProfile ? <p className="mt-2 text-sm text-emerald-800">{t("settings_saved_profile")}</p> : null}
        </form>
      </section>

      <section className="rounded-card border border-border-subtle bg-surface-card p-5 shadow-xs">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">{t("settings_section_pdf")}</p>
        <p className="mt-1 text-sm text-foreground-secondary">{t("settings_pdf_hint")}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {(["compact", "board"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={busy}
              onClick={() => void selectPdfMode(m)}
              className={`rounded-control border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
                pdfMode === m
                  ? "border-brand-300 bg-brand-50 text-brand-900"
                  : "border-border-subtle bg-surface-card text-foreground-secondary hover:bg-surface-muted"
              }`}
            >
              {m === "compact" ? t("settings_pdf_compact_btn") : t("settings_pdf_board_btn")}
            </button>
          ))}
        </div>

        <p className="mt-3 text-xs text-foreground-muted">{pdfHelp}</p>
        {savedPdf ? <p className="mt-2 text-sm text-emerald-800">{t("settings_pdf_saved")}</p> : null}
      </section>

      {me.data?.role === "admin" ? <AdminSqlPolicySection /> : null}
    </div>
  );
}
