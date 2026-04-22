# Drivee Analytics Notebook — Design System

Enterprise SaaS, AI-first analytics, **light UI**, **white surfaces**, **аккуратный зелёный акцент** (не маркетинговый лендинг). Цель — спокойный, дорогой продукт: много воздуха, чёткая типографика, сдержанные тени.

---

## 1. Colors

### Нейтральная база (chrome & text)

| Token | Role | Hex (reference) |
|-------|------|-----------------|
| `surface.canvas` | Фон приложения за карточками | `#f4f6f9` |
| `surface.page` | Альтернатива чуть теплее | `#f8fafc` |
| `surface.card` | Карточки, панели | `#ffffff` |
| `surface.muted` | Вложенные блоки, sitebar | `#f1f5f9` |
| `border.subtle` | Разделители, обводки карточек | `#e2e8f0` |
| `border.default` | Инпуты, ячейки | `#cbd5e1` |
| `text.primary` | Основной текст | `#0f172a` |
| `text.secondary` | Подписи, мета | `#475569` |
| `text.muted` | Placeholder, disabled | `#94a3b8` |
| `text.inverse` | Текст на заливке бренда | `#ffffff` |

### Brand (Drivee green)

| Token | Role | Hex |
|-------|------|-----|
| `brand.50` | Подсветки, hover-фоны кнопок | `#eefcf4` |
| `brand.100` | Selected row, soft chips | `#d8f7e6` |
| `brand.500` | Иконки, focus ring | `#22c67a` |
| `brand.600` | **Primary actions, links** | `#18a15f` |
| `brand.700` | Hover primary | `#12814c` |
| `brand.800` | Текст на светлом (редко) | `#0f5c36` |

### Semantic (не смешивать с brand-заливкой кроме success)

| Token | Use |
|-------|-----|
| `success.*` | Успех операции; **можно** наследовать от brand-tint |
| `warning.*` | Предупреждения, деградация качества | amber |
| `danger.*` | Ошибки, деструктивные действия | rose / red |
| `info.*` | Нейтральные подсказки | slate / sky |

### Data visualization

Отдельная **категориальная** палитра (6–8 цветов), **не** заливать весь UI брендом. Бренд-зелёный — максимум одна серия или «positive» в легенде.

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

**Варианты**

- **Primary:** заливка `brand-600`, текст белый, hover `brand-700`, focus ring.
- **Secondary:** белый фон, border `border-subtle`, text `text-primary`, hover `surface.muted`.
- **Ghost:** без бордера, hover `surface.muted`.
- **Danger:** заливка `danger` или outline danger — только для delete/stop run.

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

- **Neutral:** `bg-slate-100 text-slate-700`
- **Brand / success:** `bg-brand-50 text-brand-800` (без кричащей заливки 600)
- **Warning / danger / info:** семантические пастельные фоны + тёмный текст
- **AI / running:** можно `brand-50` + маленькая пульсация (не фиолетовый по умолчанию — держим палитру узкой)

Размеры: `sm` (h-5, px-2, text-[11px] uppercase tracking-wide) и `md` (h-6, px-2.5).

---

## 10. Tables

- Header: `bg-surface-muted`, текст `caption` uppercase tracking, `text-secondary`.
- Row hover: `bg-slate-50/80`.
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

## Правила использования зелёного (brand)

1. **Primary CTA** и ключевые ссылки — `brand-600`.
2. **Selection / progress / «verified»** — фоны `brand-50`–`100`, не полноразмерные заливки экрана.
3. **Не** красить все иконки в зелёный; навигация по умолчанию нейтральная, активный пункт — brand.
4. **Графики:** brand как один позитивный ряд или highlight, не как единственный цвет всех серий.
5. **Ошибки** не смешивать с brand — всегда semantic danger.
6. **AI streaming:** допустима тонкая анимация opacity или border-brand; избегать «мигающего» насыщенного зелёного на больших площадях.

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
- **Не** перегружать брендом: 80% интерфейса нейтральный slate/white.

---

## Tailwind mapping

См. `tailwind.config.ts` — расширения `colors`, `fontFamily`, `fontSize`, `boxShadow`, `borderRadius`, `keyframes` для `animate-pulse-soft`. Глобальные CSS-переменные в `app/globals.css` для семантических имён и будущей темизации.

---

## Implementation в репозитории

1. **Шрифты:** `app/layout.tsx` — `Inter` → `--font-sans`, `JetBrains_Mono` → `--font-mono` (ячейки, trace, SQL).
2. **Фон приложения:** `body` использует `bg-surface-canvas` и `text-foreground` в `globals.css`.
3. **Компоненты:** постепенно заменять `slate-*` на семантику: карточки `bg-surface-card border-border-subtle shadow-xs rounded-card`, инпуты `rounded-control`, модалки `rounded-panel shadow-modal`.
4. **Фокус:** `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:ring-offset-2` для кнопок и инпутов.
5. **Charts (recharts):** линии `stroke-[var(--brand)]` или `stroke-chart-2` и т.д.; заливки с низкой непрозрачностью.
6. **Notebook cell:** обёртка `rounded-card border border-border-subtle`; output `bg-surface-muted rounded-control`; running — `animate-pulse-soft` на badge или border-l-brand-600.
7. **Новые примитивы:** при росте UI вынести в `components/ui/` варианты `Card`, `Badge`, `Input`, `Modal` на базе токенов выше (сейчас частично есть `Button`).
