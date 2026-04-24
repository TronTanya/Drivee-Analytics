# Drivee Analytics — индекс верхнего уровня Figma

**Файл:** [Дизайн (Figma)](https://www.figma.com/design/hRDPvxDYVvKeQSieqswq57)  
**Назначение:** приложение к защите / handoff — перечень **страниц (вкладок)** и **фреймов верхнего уровня** на каждой странице (без разворачивания глубокой вложенности HTML-capture).

**Примечание:** захваты `generate_figma_design` дают корневой фрейм **«Drivee Analytics Notebook»** с сотнями вложенных слоёв (`Container`, `Link`, …) — они **не перечислены** здесь; для детализации откройте узел в Figma.

---

## Локальные стили (файл)

**Color styles (13):** `Drivee/brand/50`, `Drivee/brand/500`, `Drivee/brand/700`, `Drivee/surface/canvas`, `Drivee/surface/card`, `Drivee/surface/muted`, `Drivee/border/subtle`, `Drivee/foreground/default`, `Drivee/foreground/secondary`, `Drivee/danger/default`, `Drivee/success/default`, `Drivee/chart/1`, `Drivee/chart/2`.

**Text styles (5):** `Drivee/T/Display`, `Drivee/T/H1`, `Drivee/T/H3`, `Drivee/T/Body`, `Drivee/T/Caption`.

---

## Компоненты и наборы

| Тип | Имя |
|-----|-----|
| Component set | `Button` (варианты `variant=primary`, `secondary`, `ghost`) |
| Component | `Button / danger (destructive)` |
| Component | `Input`, `Textarea`, `Search`, `Select`, `Badge`, `Nav item`, `Role chip`, `KPI card`, `Notebook cell`, `Trace item`, `SQL block`, `Chart card`, `Report card`, `Template card`, `Dictionary row`, `Modal`, `Empty state card`, `Clarification card`, `Confidence badge` |

Соответствие коду: `frontend/components/ui/button.tsx` — варианты `primary | secondary | ghost`; `danger` в коде как variant кнопки **не** заведён.

---

## Страницы и фреймы верхнего уровня

### Cover

| Фрейм (верхний уровень) | Комментарий |
|------------------------|-------------|
| `00 — Project cover` | Обложка, Hero-плейсхолдер |
| `— Принципы: стиль и характер продукта` | Правила визуала и продукта |
| `Drivee Analytics Notebook` ×4 | Hi-fi захват с localhost (вложенная структура capture) |

### Design System

| Фрейм |
|-------|
| `01 Colors` … `24 Ambiguity state` | 24 зоны DS по чеклисту |

### Landing — desktop

| Фрейм |
|-------|
| `01 — desktop landing` |
| `02 — hero section` |
| `03 — features section` |
| `04 — benefits section` |
| `05 — role cards` |
| `06 — CTA section` |
| `07 — footer` |

### 04 — Auth

| Фрейм |
|-------|
| `auth-login` |
| `auth-register` |
| `auth-forgot` |
| `demo-role-select` |

### 05 — App Shell

| Фрейм |
|-------|
| `shell-main` |
| `sidebar-expanded` |
| `sidebar-collapsed` |
| `topbar` |
| `page-header-patterns` |
| `content-layout-patterns` |

### 06 — Dashboards

| Фрейм |
|-------|
| `dash-admin` |
| `dash-manager` |
| `dash-marketer` |
| `dash-executive` |

### 07 — Notebook

| Фрейм |
|-------|
| `notebook-empty` |
| `notebook-query` |
| `notebook-sql` |
| `notebook-chart` |
| `notebook-insight` |
| `notebook-trace-open` |
| `notebook-clarification` |
| `notebook-error` |

### 08 — Reports / History / Templates

| Фрейм |
|-------|
| `reports-list` |
| `report-details` |
| `create-report-modal` |
| `history-page` |
| `templates-library` |
| `template-preview` |

### 09 — Dictionary / Semantic Layer

| Фрейм |
|-------|
| `dictionary-list` |
| `dictionary-detail` |

### Drivee Analytics — экраны

| Фрейм | Маршрут (подсказка на фрейме) |
|-------|-------------------------------|
| `— Требования: hi-fi перенос экранов` | Чеклист переноса |
| `01 Landing / Home` | `/` |
| `02 Auth — Login` | `/login` |
| `03 Auth — Register` | `/register` |
| `04 Demo-router` (legacy) | UI: **`/notebooks`** — хаб demo-router удалён из кода |
| `05 Dashboard — Admin` | `/dashboard/admin` |
| `06 Dashboard — Manager` | `/dashboard/manager` |
| `07 Dashboard — Marketer` | `/dashboard/marketer` |
| `08 Dashboard — Executive` | `/dashboard/executive` |
| `09 Notebooks — список` | `/notebooks` |
| `10 Notebook — деталь` | `/notebooks/[id]` |
| `11 Reports` | `/reports` |
| `12 History` | `/history` |
| `13 Templates` | `/templates` |
| `14 Dictionary` | `/dictionary` |
| `15 Forecast — AutoML Lab` | `/forecast-lab` |
| `16 Settings` | `/settings` |
| `17 Data upload` | `/data-upload` |
| `18 Corrections (admin)` | `/corrections` |
| `19 UI states` | empty · loading · error · offline |

### 10 — Role scenarios

| Фрейм |
|-------|
| `— Введение` |
| `Role — Admin` |
| `Role — Manager` |
| `Role — Marketer` |
| `Role — Executive` |

### 11 — DS Components

Верхний уровень: компоненты из таблицы выше + `Button` (component set) + при необходимости фрейм `— Read me`.

### 12 — Desktop (защита)

| Фрейм |
|-------|
| `— Правила формата` |
| `Desktop 1440 — основной` (внутри: `Контент safe 1280`) |
| `Desktop 1280 — при необходимости` (внутри: `Контент на всю ширину`) |

### 13 — Жюри (показ)

| Фрейм |
|-------|
| `— Блок для жюри` |
| `01 — Landing` … `09 — Forecast screen` (карточки с `__paste hi-fi here`) |

---

## Обновление документа

Индекс снят с файла по состоянию репозитория; при массовых правках в Figma имеет смысл перегенерировать список через MCP (`get_metadata` по `node-id` страницы) или экспорт из Figma Dev Mode.
