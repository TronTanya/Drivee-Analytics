import type { Route } from "next";

export type AdminTile = {
  id: string;
  title: string;
  description: string;
  href: Route;
  tag?: string;
};

const nb = (path: string) => path as Route;

export type KpiMetric = {
  id: string;
  label: string;
  value: string;
  sub?: string;
  delta?: string;
  deltaPositive?: boolean;
};

export type PromptChip = { id: string; label: string; href: Route };

export type ListItem = {
  id: string;
  title: string;
  meta: string;
  href: Route;
};

export const ADMIN_TILES: AdminTile[] = [
  {
    id: "sources",
    title: "Настройки источников данных",
    description: "Хранилища, частота обновления, учетные данные и состояние соединений.",
    href: "/settings",
    tag: "Инфра"
  },
  {
    id: "dictionary",
    title: "Семантический словарь",
    description: "Метрики, измерения и утвержденные определения для всей организации.",
    href: "/dictionary"
  },
  {
    id: "templates",
    title: "Шаблоны отчетов",
    description: "Расписания, макеты и пресеты экспорта, общие для команд.",
    href: "/templates"
  },
  {
    id: "guardrails",
    title: "Ограничители",
    description: "Лимиты строк, политики PII и разрешенные SQL-паттерны по ролям.",
    href: "/settings",
    tag: "Политика"
  },
  {
    id: "access",
    title: "Матрица ролей и доступов",
    description: "Кто может запускать сценарии, загружать CSV и подтверждать исправления.",
    href: "/settings"
  },
  {
    id: "nb-templates",
    title: "Шаблоны сценариев",
    description: "Стартовые канвы для ops, маркетинга и руководительских циклов обзора.",
    href: "/templates"
  },
  {
    id: "audit",
    title: "Журнал аудита",
    description: "Запуски сценариев, экспорты данных и изменения админ-конфигурации.",
    href: "/history"
  },
  {
    id: "corrections",
    title: "Редактор исправлений",
    description: "Проверка ошибок модели и публикация подтвержденных исправлений в knowledge layer.",
    href: "/dictionary",
    tag: "ИИ"
  },
  {
    id: "csv",
    title: "Доступ к загрузке CSV",
    description: "Квоты по workspace, статус антивирусной проверки и схемы приземления.",
    href: "/data-upload"
  }
];

export const MANAGER_KPIS: KpiMetric[] = [
  {
    id: "orders",
    label: "Заказы (24ч)",
    value: "12.4k",
    sub: "к предыдущему дню",
    delta: "+4.2%",
    deltaPositive: true
  },
  {
    id: "canc",
    label: "Доля отмен",
    value: "2.1%",
    sub: "цель < 2.5%",
    delta: "−0.3pp",
    deltaPositive: true
  },
  {
    id: "sla",
    label: "SLA исполнения",
    value: "96.8%",
    sub: "вовремя отправлено",
    delta: "+0.6pp",
    deltaPositive: true
  },
  {
    id: "aov",
    label: "Средний чек заказа",
    value: "₽4,280",
    sub: "смешанный",
    delta: "−1.1%",
    deltaPositive: false
  }
];

export const MARKETER_KPIS: KpiMetric[] = [
  {
    id: "orders",
    label: "Заказы (7д)",
    value: "84.2k",
    sub: "анонимизированный in-city",
    delta: "+3.1%",
    deltaPositive: true
  },
  {
    id: "done",
    label: "Завершенные поездки",
    value: "62.5k",
    sub: "по driverdone timestamp",
    delta: "+2.2%",
    deltaPositive: true
  },
  {
    id: "cancel",
    label: "Всего отмен",
    value: "9.8k",
    sub: "клиент + водитель",
    delta: "−0.4pp",
    deltaPositive: true
  },
  {
    id: "avg_price",
    label: "Средняя стоимость заказа",
    value: "₽428",
    sub: "price_order_local",
    delta: "+1.3%",
    deltaPositive: true
  }
];

export const EXEC_KPIS: KpiMetric[] = [
  {
    id: "rev",
    label: "Чистая выручка YTD",
    value: "$184M",
    sub: "без FX-эффекта",
    delta: "+5.1% YoY",
    deltaPositive: true
  },
  {
    id: "margin",
    label: "Операционная маржа",
    value: "18.4%",
    sub: "скорректированная",
    delta: "+40 bps",
    deltaPositive: true
  },
  {
    id: "nps",
    label: "NPS (скользящий)",
    value: "54",
    sub: "enterprise cohort",
    delta: "+3",
    deltaPositive: true
  },
  {
    id: "risk",
    label: "Индекс риска",
    value: "Низкий",
    sub: "supply + demand",
    delta: "Стабильно",
    deltaPositive: true
  }
];

export const MANAGER_PROMPTS: PromptChip[] = [
  { id: "1", label: "Где растут отмены по складам?", href: nb("/notebooks/ops-health") },
  { id: "2", label: "Нарушения SLA за последние 7 дней", href: nb("/notebooks/ops-health") },
  { id: "3", label: "Бэклог vs capacity на завтра", href: nb("/notebooks/ops-health") }
];

export const MARKETER_PROMPTS: PromptChip[] = [
  { id: "1", label: "Отмены по city_id за прошлую неделю", href: nb("/notebooks/campaign-q1") },
  { id: "2", label: "Сравни завершенные поездки по дням", href: nb("/notebooks/campaign-q1") },
  { id: "3", label: "Средняя стоимость заказа по city_id", href: nb("/notebooks/campaign-q1") }
];

export const EXEC_PROMPTS: PromptChip[] = [
  { id: "1", label: "Факторы перевыполнения / недовыполнения квартала", href: nb("/notebooks/strategy-board") },
  { id: "2", label: "Риск географической концентрации", href: nb("/notebooks/strategy-board") },
  { id: "3", label: "Ключевой KPI narrative для совета", href: nb("/notebooks/strategy-board") }
];

export const RECENT_NOTEBOOKS: ListItem[] = [
  { id: "n1", title: "Q1 completion bridge", meta: "Обновлено 2ч назад · Вы", href: nb("/notebooks/nb-q1-bridge") },
  { id: "n2", title: "Операционные исключения — Moscow DC", meta: "Вчера · Команда", href: nb("/notebooks/ops-health") },
  { id: "n3", title: "Недельный обзор in-city заказов", meta: "3д назад · Аналитика", href: nb("/notebooks/campaign-q1") }
];

export const RECENT_REPORTS: ListItem[] = [
  { id: "r1", title: "Еженедельный KPI-пак", meta: "PDF · По расписанию в пн", href: "/reports" },
  { id: "r2", title: "Сводка закрытия финансов", meta: "Slides · По запросу", href: "/reports" },
  { id: "r3", title: "Сводка состояния клиентов", meta: "Ссылка Notion", href: "/reports" }
];

export const EXEC_SAVED_REPORTS: ListItem[] = [
  { id: "e1", title: "Board deck — закрытие февраля", meta: "Сохранено · проверено CFO", href: "/reports" },
  { id: "e2", title: "Стратегические сценарии Q2", meta: "Версия 3", href: "/reports" },
  { id: "e3", title: "Карта конкурентного давления", meta: "Автообновление в пт", href: "/reports" }
];

/** Geo bars: region → value for manager map preview */
export const GEO_REGION_DATA = [
  { region: "СЗ", orders: 4200 },
  { region: "Центр", orders: 5100 },
  { region: "Юг", orders: 3800 },
  { region: "Волга", orders: 2900 },
  { region: "Урал", orders: 2400 },
  { region: "Дальний Восток", orders: 1100 }
];

export const TREND_SERIES = [
  { m: "Я", v: 42 },
  { m: "Ф", v: 45 },
  { m: "М", v: 44 },
  { m: "А", v: 48 },
  { m: "М", v: 52 },
  { m: "И", v: 54 }
];

export const FORECAST_BANDS = [
  { w: "Н+1", low: 118, mid: 128, high: 136 },
  { w: "Н+2", low: 120, mid: 130, high: 140 },
  { w: "Н+3", low: 121, mid: 132, high: 143 },
  { w: "Н+4", low: 123, mid: 134, high: 146 }
];

export const MARKETER_CHART_A = [
  { day: "Пн", orders: 11820, done: 8760 },
  { day: "Вт", orders: 12110, done: 9015 },
  { day: "Ср", orders: 11940, done: 8892 },
  { day: "Чт", orders: 12480, done: 9280 },
  { day: "Пт", orders: 12710, done: 9475 }
];

export const MARKETER_CHART_B = [
  { city: "101", cancellations: 640 },
  { city: "205", cancellations: 522 },
  { city: "310", cancellations: 488 },
  { city: "455", cancellations: 441 }
];

export const EXEC_RADAR_PROFILE = [
  { segment: "Moscow", volume: 88, quality: 81, speed: 79 },
  { segment: "SPB", volume: 74, quality: 77, speed: 83 },
  { segment: "Kazan", volume: 63, quality: 71, speed: 68 },
  { segment: "Ekb", volume: 58, quality: 66, speed: 64 },
  { segment: "Novosib", volume: 52, quality: 62, speed: 60 }
];

export const GEO_HEATMAP_GRID = [
  { label: "Москва", value: 920 },
  { label: "СПб", value: 770 },
  { label: "Казань", value: 510 },
  { label: "Екатеринбург", value: 470 },
  { label: "Новосибирск", value: 455 },
  { label: "Нижний Новгород", value: 390 }
];
