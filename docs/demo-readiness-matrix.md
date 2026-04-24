# Drivee Analytics Notebook — Demo Readiness Matrix

## Stable (main demo)

- `frontend/app/(platform)/notebooks/page.tsx`
- `frontend/app/(platform)/scenarios/page.tsx`
- `frontend/app/(platform)/notebooks/[id]/page.tsx`
- `frontend/components/notebook/*`
- `frontend/lib/notebook/trace-model.ts`
- `frontend/lib/notebook/legacy-map.ts`
- `frontend/lib/api/request.ts`
- `frontend/lib/api/mocks/index.ts`

## Unstable (advanced only)

- `frontend/app/(platform)/forecast-lab/page.tsx`
- `frontend/components/system/data-upload-client.tsx` (stabilized in demo mode, still advanced)
- `frontend/app/(platform)/reports/page.tsx` (kept for report-reuse scenario, not first hop)
- `frontend/app/(platform)/history/page.tsx` (kept for report-reuse scenario, not first hop)

## Optional (only if time remains in defense)

- `frontend/app/(platform)/history/page.tsx`
- `frontend/app/(platform)/forecast-lab/page.tsx`
- `frontend/app/(platform)/data-upload/page.tsx`
- `frontend/app/(platform)/dictionary/page.tsx`

## Removed from main path

- AutoML/forecast/data-upload are removed from primary nav entrypoint and moved to advanced links (`PLATFORM_ADVANCED_NAV` in `frontend/lib/navigation/config.ts`).

## Demo profile (честный режим)

- Рекомендуется: **`Live + fallback`** — сначала реальный backend, mock только после ошибки (сеть / 5xx / 401 / 403), см. `frontend/lib/api/request.ts`.
- Переменные:
  - `NEXT_PUBLIC_DEMO_MODE=true` — при отсутствии `NEXT_PUBLIC_API_MOCK` включается тот же fallback-профиль, что и `NEXT_PUBLIC_API_MOCK=fallback`.
  - `NEXT_PUBLIC_API_MOCK=fallback` — явно.
  - **`NEXT_PUBLIC_DEMO_FORCE_ANALYTICS_MOCK` не включать** для «честной» аналитики: иначе `/api/v1/analytics/run` всегда клиентский мок и live pipeline не демонстрируется.
- `/api/v1/analytics/run`: при fallback после ошибки подставляется `mockRunAnalytics` (детерминированные ветки в `frontend/lib/api/mocks/index.ts` + `lib/demo/seeded-data.ts`).

Полная памятка для защиты: **`docs/demo-defense.md`**.

## Данные для live-SQL

После **`make seed`** в факт-таблицу заказов (и тем самым в **`public.train`**) загружаются тысячи строк с префиксом **`DEMO-`** (несколько `city_id`, окна по датам, `order_channel`, статусы и суммы) — см. **`docs/demo-analytics-dataset.md`**. Это снимает ощущение «игрушечного» графика на четырёх bootstrap-строках при демонстрации агрегатов и шаблонов.

