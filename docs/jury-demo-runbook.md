# Runbook: 5 сценариев для жюри

Короткий маршрут для стабильного демо через `/scenarios`.

## Перед показом

1. Поднимите стенд: `make up`
2. Прогоните стабильный минимум:
   - `make test-smoke`
   - `make test-nl`
   - `make test-guardrails`
3. Опционально: `make test-cov-core`
4. Проверьте вход в UI и доступность `ops-health`.

## Сценарий 1 — RU запрос → table/chart/insight/forecast

- Откройте карточку: `Сценарий 1` в `/scenarios`.
- Автозапуск подставит промпт с прогнозом.
- Покажите:
  - таблицу и график;
  - insight-блок;
  - в Trace секцию `Прогноз` с explainability/предупреждением.

## Сценарий 2 — Trace / explainability

- Откройте карточку: `Сценарий 2`.
- В правой панели Trace последовательно покажите:
  - intent;
  - metric;
  - generated SQL;
  - quality gate;
  - forecast explainability.

## Сценарий 3 — Неоднозначность и clarification

- Откройте карточку: `Сценарий 3`.
- Для кейса `выручка`/`лучшие каналы` покажите:
  - `Нужно уточнение`;
  - выбор варианта в clarification-cell;
  - перезапуск;
  - обновлённый результат и trace.

## Сценарий 4 — Guardrails

- Откройте карточку: `Сценарий 4`.
- Автозапуск отправляет длинный промпт.
- Ожидаемый результат:
  - блокировка guardrails;
  - понятная пользовательская ошибка (без тех.шума);
  - причины в Trace (`guardrails`, `quality gate: failed`).

## Сценарий 5 — Честные ограничения MVP

- В notebook покажите блок `Ограничения демо (честно)`:
  - baseline forecast строится по SQL-ряду и explainability trace; это не production ML;
  - live SQL может перейти в mock/stub fallback;
  - dictionary/API может быть упрощён в зависимости от env;
  - чувствительные метрики/сущности ограничены ролями;
  - live DB зависит от корректной конфигурации окружения.

Формулировка для комиссии: «Это зрелый MVP с controlled degradation и прозрачным trace. При недоступности части контуров система не маскирует риск, а явно сообщает runtime-профиль выполнения (Live / fallback / mock-only)».

## Что включать в CI (стабильно)

- Включать:
  - `make test-smoke`
  - `make test-nl`
  - `make test-guardrails`
- Отдельно/manual:
  - `make test-e2e` (browser E2E запускаются как release/demo gate, а не как обязательный шаг каждого CI-прогона)

## Автопроверка jury-режима

- Локально: `cd frontend && npm run test:e2e:jury`
- Через Makefile: `make test-e2e` (запустит `defense` + `jury` e2e-спеки).
- Быстрый прогон без повторного логина: `make test-e2e-quick` (через Playwright `storageState`).
