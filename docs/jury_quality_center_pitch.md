# Почему Drivee Analytics надёжнее обычного LLM-to-SQL

## Тезис

Мы не доверяем LLM вслепую. Каждый запрос проходит **semantic interpretation**, **SQL validation**, **correctness checks**, **result shape**, **visualization match** и **guardrails**. Качество измеряется **Golden Evaluation Suite** и отображается в **Drivee Quality Center** — внутри продукта для бизнеса (роли, отчёты, расписание, forecast, explainability), а не в отдельном SQL IDE.

## Речь (коротко)

Обычный подход — prompt → SQL. Наш подход — **prompt → intent → semantic dictionary → metric / dimension / time mapping → SQL generation → safety validation → correctness validation → execution → result shape check → chart match → trace → confidence**. На этом стеке работает notebook для бизнеса; Quality Center доказывает стабильность и даёт **repair brief** после прогона.

## Демо ~60 секунд

1. Открыть **Quality Center** (`/quality`).
2. Показать **Overall Quality Score** и статус passed / needs attention.
3. Вкладка **Understanding** — expected vs actual, SQL, trace.
4. **SQL Correctness** — структура SQL и проверки.
5. **Guardrails** — опасный запрос **blocked**.
6. Закрыть фразой: **«Качество измеряется, а не заявляется.»**

## Команды для жюри (по желанию)

```bash
make quality-eval
pytest backend/tests/evaluation -q
```

Подробнее: [evaluation_guide.md](evaluation_guide.md), архитектурный аудит: [quality_center_audit.md](quality_center_audit.md).
