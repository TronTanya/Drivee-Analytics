# Drivee Analytics Notebook — Demo Script (Defense)

## Main demo path (guaranteed)

1. Open `/demo-router`.
2. Open `Main notebook demo` (`/notebooks/ops-health`).
3. In prompt cell, run:
   - `Покажи топ-3 города по количеству отменённых заказов на этой неделе`
4. Show chain:
   - `Уточнение` -> `План` (trace) -> `SQL` -> `Таблица` -> `График` -> `Инсайт`.
5. Click `Сохранить как отчет`.
6. Click `PDF по умолчанию`.
7. Go to `/reports` and show created report row.
8. Go to `/history` and show rerun/save-from-history actions.

## Additional scenario 1 — Clarification

1. Open `/notebooks/clarification-demo`.
2. Run prompt:
   - `Покажи лучшие города за неделю`
3. Show clarification question and choose one option.
4. Verify plan/result chain updates.

## Additional scenario 2 — Follow-up

1. Open `/notebooks/follow-up-demo`.
2. Run prompt:
   - `Покажи отмены по городам за неделю. А теперь только по Москве.`
3. Show updated trace + SQL + chart.

## Additional scenario 3 — Report reuse

1. Open `/reports`.
2. Select report actions:
   - rerun report;
   - download PDF.
3. Open `/history`.
4. Save run/query as report and confirm action message.

## Fallback path if one step fails

1. If backend/LLM is unavailable, keep same flow on notebooks page.
2. Verify `Demo Health` badge:
   - API mode (`Live + fallback` or `Mock only`)
   - backend status (`online/offline`)
3. Continue demo with fallback cells:
   - explainability + SQL preview + table + chart + insight remain visible.
4. Continue with save report and local PDF generation.

## Expected visible outcomes

- No dead-end UI.
- No raw stack traces.
- Clear status banners and controlled fallback.
- Repeatable outputs across reruns (seeded demo data).

