"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type PropsWithChildren } from "react";
import { useSession } from "@/lib/auth/session-context";
import { canAccessPath, DASHBOARD_BY_ROLE, filterNavForRole, PLATFORM_NAV } from "@/lib/navigation/config";
import type { UserRole } from "@/lib/types";

const ROLE_OPTIONS: { key: UserRole; label: string }[] = [
  { key: "admin", label: "Администратор" },
  { key: "manager", label: "Менеджер" },
  { key: "marketer", label: "Маркетолог" },
  { key: "executive", label: "Руководитель" }
];

export function PlatformShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, setRole } = useSession();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navItems = filterNavForRole(PLATFORM_NAV, session.role);
  const myDashboard = DASHBOARD_BY_ROLE[session.role];
  const allowed = canAccessPath(session.role, pathname);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

  const navLinks = (
    <>
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href as Route}
              aria-current={isActive ? "page" : undefined}
              className={`interactive-focus rounded-control px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "border border-border-subtle bg-[#f6f8ee] text-foreground shadow-xs"
                  : "text-foreground-secondary hover:bg-surface-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <nav className="mt-1 flex flex-col gap-1">
        <Link
          href={myDashboard as Route}
          aria-current={pathname === myDashboard ? "page" : undefined}
          className={`interactive-focus rounded-control px-3 py-2 text-sm font-medium transition ${
            pathname === myDashboard
              ? "border border-border-subtle bg-[#f6f8ee] text-foreground shadow-xs"
              : "text-foreground-secondary hover:bg-surface-muted hover:text-foreground"
          }`}
        >
          Дашборд
        </Link>
      </nav>
    </>
  );

  return (
    <div className="min-h-screen bg-surface-page">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-control bg-surface-card px-3 py-2 text-sm font-semibold text-foreground shadow-soft focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Перейти к основному контенту
      </a>
      <header className="sticky top-0 z-40 border-b border-border-subtle/80 bg-surface-card/90 backdrop-blur supports-[backdrop-filter]:bg-surface-card/80">
        <div className="layout-shell-container flex flex-wrap items-center justify-between gap-3 py-3 sm:gap-4 sm:py-4">
          <div className="flex items-center gap-3 sm:gap-6">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="interactive-focus inline-flex h-9 w-9 items-center justify-center rounded-control border border-border-subtle bg-surface-card text-foreground-secondary hover:text-foreground lg:hidden"
              aria-label="Открыть навигацию"
            >
              ☰
            </button>
            <Link
              href={"/demo-router" as Route}
              className="interactive-focus inline-flex items-center rounded-control border border-transparent px-1 py-0.5 transition hover:border-border-subtle/70 hover:bg-surface-muted/50"
            >
              <Image
                src="/drivee-logo-v3.png"
                alt="Drivee Analytics"
                width={230}
                height={130}
                className="h-10 w-auto sm:h-12"
                priority
              />
            </Link>
            <Link
              href={myDashboard as Route}
              className="interactive-focus hidden rounded-control border border-transparent px-2 py-1 text-sm font-medium text-foreground-secondary transition hover:border-border-subtle hover:bg-surface-muted hover:text-foreground sm:inline"
            >
              Мой дашборд
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Link
              href={"/login" as Route}
              className="interactive-focus rounded-control border border-border-subtle bg-surface-card px-2.5 py-1.5 text-xs font-semibold text-foreground-secondary shadow-xs transition hover:border-border-subtle hover:bg-surface-muted hover:text-foreground"
            >
              Вход
            </Link>
            <Link
              href={"/settings" as Route}
              className="interactive-focus rounded-control border border-border-subtle bg-surface-card px-2.5 py-1.5 text-xs font-semibold text-foreground-secondary shadow-xs transition hover:border-border-subtle hover:bg-surface-muted hover:text-foreground"
            >
              Настройки
            </Link>
            <label className="flex items-center gap-2 text-xs text-foreground-muted">
              <span className="hidden sm:inline">Демо-роль</span>
              <select
                className="interactive-focus rounded-control border border-border-subtle bg-surface-card px-2.5 py-1.5 text-sm text-foreground shadow-xs transition hover:border-brand-200 focus:border-brand-400"
                value={session.role}
                onChange={(e) => {
                  const nextRole = e.target.value as UserRole;
                  setRole(nextRole);
                  const targetDashboard = DASHBOARD_BY_ROLE[nextRole];
                  if (pathname !== targetDashboard) {
                    router.push(targetDashboard as Route);
                  }
                }}
                aria-label="Демо-роль"
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </header>
      <div className="layout-shell-container layout-shell-grid">
        <aside className="order-2 hidden h-fit rounded-card border border-border-subtle bg-surface-card p-3 shadow-xs sm:p-4 lg:order-1 lg:block lg:sticky lg:top-24">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Навигация</p>
          {navLinks}
        </aside>
        <main id="main-content" className="order-1 min-h-[50vh] space-y-4 lg:order-2 lg:space-y-6">
          {allowed ? (
            children
          ) : (
            <section className="rounded-card border border-rose-200 bg-rose-50 px-6 py-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">403 · Доступ ограничен</p>
              <h1 className="mt-2 text-xl font-semibold text-rose-900">У вашей роли нет доступа к этой странице</h1>
              <p className="mt-2 text-sm text-rose-800">
                Переключите роль в шапке или перейдите на доступный дашборд.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={myDashboard as Route}
                  className="interactive-focus rounded-control border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-100"
                >
                  Открыть мой дашборд
                </Link>
                <Link
                  href={"/demo-router" as Route}
                  className="interactive-focus rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-sm font-semibold text-foreground-secondary hover:bg-surface-muted"
                >
                  Вернуться в роутер
                </Link>
              </div>
            </section>
          )}
        </main>
      </div>
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/35"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Закрыть навигацию"
          />
          <aside className="absolute left-0 top-0 h-full w-[86vw] max-w-[320px] overflow-y-auto border-r border-border-subtle bg-surface-card p-4 shadow-modal">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Навигация</p>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="interactive-focus rounded-control px-2 py-1 text-sm text-foreground-secondary hover:bg-surface-muted hover:text-foreground"
              >
                Закрыть
              </button>
            </div>
            {navLinks}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
