# Drivee Analytics Notebook — Design System

Enterprise SaaS, AI-first analytics, **light UI**, **white surfaces**, **лаймовый бренд-акцент** (сдержанно: CTA, focus, навигация). Цель — спокойный, дорогой продукт: много воздуха, чёткая типографика, сдержанные тени.

**Источник правды по цветам и типографике:** [`tailwind.config.ts`](tailwind.config.ts) и CSS-утилиты в [`app/globals.css`](app/globals.css). Этот документ описывает роли токенов и правила использования.

---

## 1. Colors

### Нейтральная база (chrome & text)

Значения ниже соответствуют Tailwind-расширению `surface`, `border`, `foreground` в коде.

| Token (Tailwind) | Role | Hex (reference) |
|------------------|------|-----------------|
| `surface.canvas` | Фон приложения за карточками | `#f3f4f6` |
| `surface.page` | Страница / shell | `#f3f4f6` |
| `surface.card` | Карточки, панели | `#ffffff` |
| `surface.muted` | Вложенные блоки, sidebar | `#f7f8fa` |
| `border.subtle` | Разделители, обводки карточек | `#e2e8f0` |
| `border.DEFAULT` | Инпуты, чуть сильнее контраст | `#cfd4dd` |
| `foreground` | Основной текст | `#111111` |
| `foreground.secondary` | Подписи, мета | `#5b6472` |
| `foreground.muted` | Placeholder, disabled | `#7a8391` |

### Brand (Drivee lime — как в `tailwind.config.ts`)

| Token | Role | Hex |
|-------|------|-----|
| `brand.50` | Подсветки, активный пункт навигации, мягкие hero-блоки | `#f6fbe7` |
| `brand.100` | Hover-фоны рядом с акцентом | `#edf9cf` |
| `brand.200` … `brand.400` | Градации для тепловых превью, вторичные акценты | см. конфиг |
| `brand.500` | **Primary CTA** (часто с текстом `text-black`), пульсация шагов | `#b9ff31` |
| `brand.600` | DEFAULT / fallback акцент | `#97db00` |
| `brand.700` | Hover primary, вторичные линии на графиках | `#7aa700` |
| `brand.800` … `brand.900` | Тёмные варианты для контраста на светлом | см. конфиг |

**Правила бренда (кратко)**

- Не заливать целые экраны насыщенным `brand-500` — только акценты, бейджи, одна primary-кнопка в зоне внимания, полоски и выделения.
- Крупные промо-блоки: `bg-brand-50` + рамка `border-brand-200/80`, а не сплошной лайм.

### Semantic (не смешивать с brand-заливкой кроме success)

| Token | Use |
|-------|-----|
| `success.*` | Успех операции |
| `warning.*` | Предупреждения, деградация качества | amber |
| `danger.*` | Ошибки, деструктивные действия | rose / red |
| `info.*` | Нейтральные подсказки | sky |

### Data visualization (`chart.*` в Tailwind)

Категориальная палитра для серий: `chart.1` … `chart.6` (чёрный, лайм, серый, sky, amber, серый). **Не** подменять ею весь UI.

- **Максимум одна** серия на графике может использовать `brand` / `chart.2`, остальные — `chart.1`, `chart.3`, `chart.4` и т.д.
- Легенда и оси — нейтральные `foreground.secondary` / `foreground.muted`.

---

## 2. Typography

| Style | Font | Size / line | Weight | Use |
|-------|------|-------------|--------|-----|
| Display | UI sans (Inter / Geist) | 30px / 36px | 600 | Редко: пустые состояния, onboarding |
| H1 | UI sans | 24px / 32px | 600 | Заголовок страницы |
| H2 | UI sans | 20px / 28px | 600 | Секции |
| H3 | UI sans | 16px / 24px | 600 | Подсекции, карточки |
| Body | UI sans | 14px / 22px | 400 | Основной текст |
| Body sm | UI sans | 13px / 20px | 400 | Плотные списки, таблицы |
| Caption | UI sans | 12px / 16px | 500 | Метки полей, badges |
| Mono | JetBrains Mono / Geist Mono | 13px / 20px | 400 | SQL, trace, IDs |

**Правила:** заголовки без лишнего капса; числа в дашбордах — tabular figures если доступно (`font-variant-numeric: tabular-nums`).

---

## 3. Spacing

База **4px**. Слоты:

| Token | px | Use |
|-------|-----|-----|
| `0.5` | 2 | Микро-гэпы в chip |
| `1` | 4 | Иконка–текст |
| `2` | 8 | Внутри компактных рядов |
| `3` | 12 | Padding input sm |
| `4` | 16 | Стандарт gap в формах |
| `5` | 20 | Карточка compact |
| `6` | 24 | Карточка default padding |
| `8` | 32 | Секции |
| `10` | 40 | Крупные блоки |
| `12` | 48 | Hero / empty states |

Контентная ширина ноутбука: `max-w-5xl` / `max-w-6xl` для читаемости; сайдбар фиксированной ширины (например 240–280px).

---

## 4. Shadows

| Token | CSS gist | Use |
|-------|----------|-----|
| `shadow-xs` | 0 1px 2px rgb(15 23 42 / 0.04) | Карточки в списке |
| `shadow-sm` | 0 1px 3px …, 0 1px 2px … | Поднятая карточка, dropdown |
| `shadow-md` | 0 4px 12px … | Sticky bars, popover |
| `shadow-lg` | 0 12px 40px … | Modal |
| `ring-focus` | 0 0 0 3px brand @ 25% | Focus visible |

Избегать тяжёлых теней на каждой карточке — премиум = меньше «плавающего» шума.

---

## 5. Border radius

| Token | Value | Use |
|-------|-------|-----|
| `rounded-sm` | 6px | Chips, small controls |
| `rounded-md` | 8px | Inputs, buttons |
| `rounded-lg` | 12px | Cards, panels |
| `rounded-xl` | 16px | Modal, hero cards |
| `rounded-2xl` | 20px | Крупные контейнеры ноутбука (опционально) |

Внутри data-dense таблиц — `rounded-md` на контейнере, внутри без лишнего скругления ячеек.

---

## 6. Buttons

**Варианты** (см. реализацию [`components/ui/button.tsx`](components/ui/button.tsx))

- **Primary:** `bg-brand-500 text-black`, hover `bg-brand-400`, focus ring `brand-500/45` (см. `interactive-focus` в `globals.css`).
- **Secondary:** `bg-surface-card border-border-subtle text-foreground`, hover `bg-surface-muted`.
- **Ghost:** без бордера, hover `surface.muted`.
- **Danger:** заливка `danger` или outline danger — только для delete/stop run.

Для ссылок-CTA на лендинге допустимы `bg-foreground text-surface-card` (нейтральный primary) или тот же паттерн, что у `Button` primary, чтобы не плодить третий «главный» стиль.

**Размеры:** `sm` (h-8, px-3, text-sm), `md` (h-9, px-4), `lg` (h-10, px-5).

**С иконкой:** 8px gap, иконка 16px.

---

## 7. Inputs

- Фон белый, border `border-default`, radius `md`.
- Focus: ring brand (не сплошная обводка всего поля брендом — только ring).
- Error: border `danger`, текст ошибки `caption` + `danger`.
- Disabled: фон `surface.muted`, текст `text.muted`.
- Label сверху `caption` semibold; helper под полем `caption` `text-muted`.

Textarea в ячейках ноутбука — monospace, min-height по контенту.

---

## 8. Cards

- Фон `surface.card`, border `border.subtle`, `shadow-xs` или без тени + только border.
- Padding по умолчанию `p-6`; компактные списки `p-4`.
- Заголовок карточки: H3 + опционально действие справа (ghost button).

---

## 9. Badges

- **Neutral:** `bg-surface-muted text-foreground-secondary`
- **Brand / success:** `bg-brand-50 text-foreground` или `text-brand-900` (без кричащей заливки `brand-500` на всю плашку)
- **Warning / danger / info:** семантические пастельные фоны + тёмный текст
- **AI / running:** можно `brand-50` + маленькая пульсация (не фиолетовый по умолчанию — держим палитру узкой)

Размеры: `sm` (h-5, px-2, text-[11px] uppercase tracking-wide) и `md` (h-6, px-2.5).

---

## 10. Tables

- Header: `bg-surface-muted`, текст `caption` uppercase tracking, `text-secondary`.
- Row hover: `hover:bg-surface-muted/80`.
- Selected row: `bg-brand-50` + левый акцент `border-l-2 border-brand-600`.
- Границы: горизонтальные `border-subtle`; вертикали минимизировать.
- Числа выравнивать вправо, `tabular-nums`.

---

## 11. Modals

- Overlay: `bg-slate-900/40` + лёгкий blur (опционально).
- Panel: белый, `rounded-xl`, `shadow-lg`, `max-w-lg` (или `2xl` для форм).
- Header + body + footer с разделителем `border-subtle`.
- Primary действие справа в футере.

---

## 12. Notebook cells

Структура строки ячейки:

1. **Gutter:** номер / drag handle (muted).
2. **Toolbar:** run, duplicate, delete — ghost icons.
3. **Editor zone:** белый фон, border, monospace; состояние «running» — тонкая полоса или badge.
4. **Output zone:** `surface.muted`, monospace для логов; таблицы/чарты — вложенная белая под-карточка с `rounded-md`.

Состояния: idle / running / success / error — см. раздел States.

---

## 13. Trace panel

- Фон `surface.muted` или боковая колонка; `border-l` `border-subtle`.
- Строки: timestamp + level + message (mono sm).
- Expandable JSON: indent, ключи `text-secondary`, значения `text-primary`.
- Критические шаги: левый маркер `brand-600` 2px.

---

## 14. Chart containers

- Обёртка: card с заголовком (metric name + period) и `min-h-[240px]`.
- Пусто: иллюстрация + короткий текст + CTA secondary.
- Загрузка: skeleton внутри контейнера (не глобальный спиннер на весь экран).
- Легенда и оси — нейтральные серые; **одна** акцентная серия может быть `brand-600`.

---

## 15. Clarification cards (AI)

- Лёгкая рамка `border-brand-200` или левый акцент `border-l-4 border-brand-500`.
- Заголовок: «Нужно уточнение» (H3).
- Список вопросов — чекбоксы или chips; primary CTA «Отправить уточнения».
- Не использовать сплошной зелёный фон карточки — только акценты.

---

## 16. Insight cards

- Иконка или метка «Insight» в badge neutral/brand-soft.
- Основной инсайт — **Body** semibold или H3.
- Поддержка: bullets `text-secondary`.
- Опционально footer: источник, время, confidence `caption`.

---

## 17. Forecast cards

- Верх: сценарий (tabs или segmented control).
- Ключевая метрика крупно (tabular-nums) + delta (success/danger semantic).
- Область неопределённости: светлая заливка `brand-50` или neutral band под графиком — без перегруза зелёным.
- Disclaimer мелким `caption` `text-muted`.

---

## Правила использования бренда (лайм)

1. **Primary CTA** — как правило `brand-500` + тёмный текст; крупные нейтральные действия допускают `bg-foreground text-surface-card`.
2. **Selection / progress / «verified»** — фоны `brand-50`–`brand-100`, не полноразмерные заливки экрана.
3. **Не** красить все иконки в бренд; навигация по умолчанию нейтральная, активный пункт — `bg-brand-50` + рамка (см. shell).
4. **Графики:** максимум одна серия через `chart.2` / brand; остальные — `chart.1`, `chart.3`, `chart.4` …
5. **Ошибки** не смешивать с brand — всегда `danger.*`.
6. **AI streaming:** допустима тонкая анимация opacity или `border-brand`; избегать насыщенного лайма на больших площадях.

---

## Loading / empty / error / success

| State | Паттерн |
|-------|---------|
| **Loading** | Skeleton (card/table/chart placeholders), inline spinner 16px в кнопке, progress bar для длинных run |
| **Empty** | Иллюстрация или иконка muted, H3 + одно предложение + secondary CTA |
| **Error** | `danger` border/alert блок; заголовок + что делать; retry = secondary, report = ghost |
| **Success** | Toast или inline banner `success` пастельный фон; для ячейки — check + «Ran in 1.2s» caption |

---

## Premium SaaS visual guidelines

- **Один главный фокус** на экране; вторичные действия прячем в меню или ghost.
- **Плотность:** analytics screens допускают compact table, но **поля и карточки** — с воздухом.
- **Микро-анимации:** 150–200ms, ease-out; без bounce.
- **Консистентность:** один радиус для «интерактивных» блоков внутри фичи.
- **Доступность:** контраст текста WCAG AA; фокус всегда видимый.
- **Не** перегружать брендом: большая часть интерфейса — `surface.*` и `foreground.*`, бренд точечно.

---

## Утилиты слоя `components` (`app/globals.css`)

| Класс | Назначение |
|-------|------------|
| `surface-hero` | Крупные карточки / шапки: белый фон, крупное скругление, лёгкая рамка |
| `surface-section` | Секции страницы: карточка с `rounded-[24px]` |
| `surface-content` | Вложенные белые блоки |
| `surface-console` | Терминальный вид (SQL и т.п.) |
| `surface-decision` | Карточки решений / промежуточные панели |
| `interactive-focus` | Единое `focus-visible` кольцо |
| `layout-shell-container` | `max-w-7xl` + горизонтальные отступы shell |
| `layout-shell-grid` | Сетка sidebar + main |
| `layout-page-stack` | Вертикальный ритм страницы |

---

## Tailwind mapping

См. [`tailwind.config.ts`](tailwind.config.ts) — расширения `colors`, `fontFamily`, `fontSize`, `boxShadow`, `borderRadius`, `keyframes` для `animate-pulse-soft`. В [`app/globals.css`](app/globals.css) — зеркальные CSS-переменные (`--surface-canvas`, `--brand`, …) и утилиты из таблицы выше.

---

## Implementation в репозитории

1. **Шрифты:** `app/layout.tsx` — `Inter` → `--font-sans`, `JetBrains_Mono` → `--font-mono` (ячейки, trace, SQL).
2. **Фон приложения:** `body` использует `bg-surface-canvas` и `text-foreground` в `globals.css`.
3. **Компоненты:** постепенно заменять `slate-*` на семантику: карточки `bg-surface-card border-border-subtle shadow-xs rounded-card`, инпуты `rounded-control`, модалки `rounded-panel shadow-modal`.
4. **Фокус:** `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:ring-offset-2` для кнопок и инпутов.
5. **Charts (recharts):** линии `stroke-[var(--brand)]` или `stroke-chart-2` и т.д.; заливки с низкой непрозрачностью.
6. **Notebook cell:** обёртка `rounded-card border border-border-subtle`; output `bg-surface-muted rounded-control`; running — `animate-pulse-soft` на badge или border-l-brand-600.
7. **Новые примитивы:** при росте UI вынести в `components/ui/` варианты `Card`, `Badge`, `Input`, `Modal` на базе токенов выше (сейчас частично есть `Button`).
