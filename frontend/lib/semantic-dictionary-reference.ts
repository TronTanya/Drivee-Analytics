import type { UserRole } from "@/lib/types";

export type SemanticDictionaryKind = "metric" | "dimension" | "filter";

export type SemanticDictionaryReferenceRow = {
  term: string;
  sqlOrFormula: string;
  kind: SemanticDictionaryKind;
  synonyms: string[];
  roles: UserRole[];
  exampleQuestion: string;
};

const ALL_ROLES: UserRole[] = ["admin", "manager", "marketer", "executive"];

/** Справочные определения semantic layer (read-only UI; источник истины для SQL — бэкенд / словарь). */
export const SEMANTIC_DICTIONARY_REFERENCE_ROWS: SemanticDictionaryReferenceRow[] = [
  {
    term: "Выручка",
    sqlOrFormula: "SUM(price_order_local)",
    kind: "metric",
    synonyms: ["revenue", "оборот", "деньги", "доход по заказам"],
    roles: ALL_ROLES,
    exampleQuestion: "Покажи выручку по городам за прошлую неделю"
  },
  {
    term: "Количество заказов",
    sqlOrFormula: "COUNT(order_id)",
    kind: "metric",
    synonyms: ["orders", "число заказов", "заказы", "order count"],
    roles: ALL_ROLES,
    exampleQuestion: "Сколько заказов по каналам за текущий месяц?"
  },
  {
    term: "Средний чек",
    sqlOrFormula: "AVG(price_order_local)",
    kind: "metric",
    synonyms: ["AOV", "average order value", "средняя сумма заказа"],
    roles: ALL_ROLES,
    exampleQuestion: "Какой средний чек по городам за последние 7 дней?"
  },
  {
    term: "Город",
    sqlOrFormula: "city_order",
    kind: "dimension",
    synonyms: ["city", "города", "локация"],
    roles: ALL_ROLES,
    exampleQuestion: "Топ-5 городов по отменам за неделю"
  },
  {
    term: "Канал",
    sqlOrFormula: "source_order",
    kind: "dimension",
    synonyms: ["channel", "источник", "канал привлечения"],
    roles: ALL_ROLES,
    exampleQuestion: "Сравни выручку по каналам за месяц"
  },
  {
    term: "Статус заказа",
    sqlOrFormula: "status_order",
    kind: "dimension",
    synonyms: ["order status", "стадия заказа"],
    roles: ALL_ROLES,
    exampleQuestion: "Распределение заказов по статусам за сегодня"
  },
  {
    term: "Завершённые заказы",
    sqlOrFormula: "status_order = 'done'",
    kind: "filter",
    synonyms: ["completed", "done", "завершённые", "выполненные"],
    roles: ALL_ROLES,
    exampleQuestion: "Выручка только по завершённым заказам за квартал"
  },
  {
    term: "Дата заказа",
    sqlOrFormula: "created_at",
    kind: "dimension",
    synonyms: ["order date", "дата создания", "время заказа"],
    roles: ALL_ROLES,
    exampleQuestion: "Динамика заказов по дням за последние 14 дней"
  },
  {
    term: "Регион",
    sqlOrFormula: "region",
    kind: "dimension",
    synonyms: ["geo region", "территория"],
    roles: ALL_ROLES,
    exampleQuestion: "Сравни метрики по регионам за год"
  },
  {
    term: "Прогноз",
    sqlOrFormula: "forecast based on historical metric",
    kind: "metric",
    synonyms: ["forecast", "prediction", "прогнозирование", "baseline"],
    roles: ALL_ROLES,
    exampleQuestion: "Спрогнозируй выручку на следующие 30 дней по дневному ряду"
  }
];

const KIND_LABEL_RU: Record<SemanticDictionaryKind, string> = {
  metric: "metric",
  dimension: "dimension",
  filter: "filter"
};

export function semanticKindLabelRu(kind: SemanticDictionaryKind): string {
  return KIND_LABEL_RU[kind];
}

const ROLE_LABEL_RU: Record<UserRole, string> = {
  admin: "Админ",
  manager: "Менеджер",
  marketer: "Маркетолог",
  executive: "Руководитель"
};

export function formatRolesRu(roles: UserRole[]): string {
  return roles.map((r) => ROLE_LABEL_RU[r]).join(", ");
}
