import type { UserRole } from "@/lib/types";

export type NavItem = {
  href: string;
  label: string;
  /** If set, only these roles see the item. If omitted, all roles see it. */
  roles?: UserRole[];
};

/** Stable primary navigation for defense demo. */
export const PLATFORM_NAV: NavItem[] = [
  { href: "/notebooks", label: "Обзор" },
  { href: "/scenarios", label: "Сценарии" },
  { href: "/templates", label: "Шаблоны", roles: ["admin", "manager", "marketer", "executive"] },
  { href: "/reports", label: "Отчеты", roles: ["admin", "manager", "marketer", "executive"] },
  { href: "/history", label: "История", roles: ["admin", "manager", "marketer", "executive"] },
  { href: "/quality", label: "Quality Center", roles: ["admin", "manager", "marketer", "executive"] },
  { href: "/dictionary", label: "Словарь", roles: ["admin"] },
  { href: "/corrections", label: "Коррекции", roles: ["admin"] },
  { href: "/settings", label: "Настройки" }
];

/** Optional/advanced modules. Keep out of the primary defense path. */
export const PLATFORM_ADVANCED_NAV: NavItem[] = [
  { href: "/forecast-lab", label: "AutoML Lab", roles: ["admin", "manager", "marketer", "executive"] },
  { href: "/data-upload", label: "Загрузка данных", roles: ["admin", "manager", "marketer"] }
];

export const DASHBOARD_BY_ROLE: Record<UserRole, string> = {
  admin: "/dashboard/admin",
  manager: "/dashboard/manager",
  marketer: "/dashboard/marketer",
  executive: "/dashboard/executive"
};

export function filterNavForRole(items: NavItem[], role: UserRole): NavItem[] {
  return items.filter((item) => {
    if (!item.roles?.length) {
      return true;
    }
    return item.roles.includes(role);
  });
}

function isAllowed(item: NavItem, role: UserRole): boolean {
  if (!item.roles?.length) return true;
  return item.roles.includes(role);
}

export function canAccessPath(role: UserRole, pathname: string): boolean {
  if (pathname.startsWith("/dashboard/")) {
    if (role === "admin") return true;
    return pathname === DASHBOARD_BY_ROLE[role];
  }

  const allKnownItems = [...PLATFORM_NAV, ...PLATFORM_ADVANCED_NAV];
  const item = allKnownItems.find((nav) => pathname === nav.href || pathname.startsWith(`${nav.href}/`));

  if (!item) {
    // Unknown platform routes should not be implicitly public in demo mode.
    return false;
  }

  return isAllowed(item, role);
}
