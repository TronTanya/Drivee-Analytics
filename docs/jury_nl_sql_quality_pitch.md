# Почему наш NL→SQL надёжнее обычного LLM-подхода

Drivee Analytics **не генерирует SQL напрямую из промпта**. Мы используем controlled NL→SQL pipeline:

Пользовательский вопрос  
→ intent detection  
→ semantic business dictionary  
→ metric/dimension mapping  
→ time range parsing  
→ SQL generation  
→ SQL validation  
→ role-based guardrails  
→ execution  
→ chart recommendation  
→ explainability trace  
→ confidence score.

## Главное отличие

Мы **измеряем качество** через **Golden NL→SQL Evaluation Suite** — набор эталонных бизнес-запросов на русском с ожидаемыми intent, метрикой, измерениями, периодом и политиками clarification/guardrail. Сервис `nl_sql_evaluator` прогоняет каждый кейс через тот же `QueryOrchestrator`, что и notebook, и считает метрики (intent/metric/dimension/time/chart/clarification/guardrail/SQL validation).

## На защите говорим

«Мы не просто показываем красивый пример. У нас есть набор эталонных бизнес-запросов, который автоматически проверяет понимание intent, метрик, измерений, периода, SQL, графика, уточнений и guardrails. Поэтому точность NL→SQL у нас **измеряемая**, **воспроизводимая** и **улучшаемая**.»

## Сравнение

| Обычный LLM | Drivee Analytics |
|-------------|------------------|
| prompt → SQL → риск hallucination и утечки данных | prompt → semantic interpretation → validation → safe SQL → trace → confidence |
| Качество субъективно | Качество считается golden suite и API `/api/v1/evaluation/nl-sql/*` |
| Сложно доказать жюри | UI `/quality` + pytest `make test-nl-sql-quality` |
