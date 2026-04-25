"""Человекочитаемый слой explainability поверх технического trace_payload."""

from __future__ import annotations

from typing import Any

from app.schemas.clarification import clarification_reason_summary_ru
from app.schemas.orchestration import OrchestrationOutput

_INTENT_RU: dict[str, str] = {
    "trend": "динамика метрики во времени (тренд, изменения по периодам)",
    "comparison": "сравнение сегментов или измерений по одной метрике",
    "ranking": "ранжирование объектов (топ, «лучшие/худшие») по метрике",
    "share": "доля или структура (доли категорий относительно целого)",
    "geo": "географический или территориальный срез данных",
    "summary": "агрегированная сводка по метрике без сложного сравнения",
    "forecast": "прогноз или экстраполяция ряда на будущие периоды",
}


def _truncate(text: str, max_len: int = 720) -> str:
    t = (text or "").strip()
    if len(t) <= max_len:
        return t
    return t[: max_len - 1] + "…"


def _structured(tp: dict[str, Any]) -> dict[str, Any]:
    raw = tp.get("structured_interpretation")
    return dict(raw) if isinstance(raw, dict) else {}


def _semantic_terms_lines(tp: dict[str, Any]) -> list[str]:
    raw = tp.get("semantic_terms")
    if not isinstance(raw, list) or not raw:
        return []
    lines: list[str] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        surf = str(item.get("surface_form") or "").strip()
        key = str(item.get("term_key") or "").strip()
        frag = str(item.get("sql_fragment") or "").strip()
        if surf and key and frag:
            lines.append(f"«{surf}» → {key} ({_truncate(frag, 200)})")
        elif surf and key:
            lines.append(f"«{surf}» → {key}")
        elif key:
            lines.append(key)
    return lines


def _filters_from_structured(struct: dict[str, Any]) -> list[str]:
    raw = struct.get("filters")
    if not isinstance(raw, dict):
        return []
    out: list[str] = []
    for k, v in raw.items():
        if v is None or v == "":
            continue
        if isinstance(v, (dict, list)):
            continue
        out.append(f"{k} = {v}")
    return out[:32]


def _sql_generation_ru(tp: dict[str, Any], *, general_conversation: bool, guard_blocked: bool) -> str:
    if general_conversation:
        return "SQL к датасету заказов не строился: включён разговорный ответ вне аналитического контура."
    if guard_blocked:
        return "SQL не генерировался: запрос остановлен политиками безопасности до этапа построения запроса."
    sg = tp.get("sql_generation")
    if not isinstance(sg, dict):
        sg = {}
    source = str(sg.get("source") or "").strip()
    base = str(sg.get("base_source") or "").strip()
    intent = str(tp.get("intent") or "").strip()
    intent_tail = f" для intent «{intent}»." if intent else "."
    if source == "learned_correction":
        return (
            "Выбран SQL из сохранённой коррекции (обучение на предыдущих правках в workspace), "
            "при несовпадении шаблон был заменён на проверенный вариант."
        )
    if source == "semantic_mapping" or base == "semantic_mapping":
        return (
            "SQL собран из шаблона движка с подстановкой семантики метрики (словарь терминов → SQL-фрагменты)"
            + intent_tail
        )
    if source == "skipped":
        return "Генерация SQL пропущена на этом пути выполнения."
    return (
        "SQL собран из стандартного шаблона NL→SQL под выбранный intent и извлечённые сущности"
        + intent_tail
    )


def _sql_safety_ru(tp: dict[str, Any], *, output: OrchestrationOutput, guard_blocked: bool) -> str:
    if guard_blocked:
        g = tp.get("guardrails")
        msgs: list[str] = []
        if isinstance(g, dict):
            raw_m = g.get("messages_ru")
            if isinstance(raw_m, list):
                msgs = [str(x) for x in raw_m if x is not None]
        head = "Запрос не дошёл до безопасного SQL: сработали guardrails оркестратора."
        if msgs:
            return head + " " + _truncate(" ".join(msgs), 500)
        return head

    if bool(tp.get("general_conversation")):
        return "Проверка SQL guardrails не применялась: аналитический запрос к БД не выполнялся."

    sv = tp.get("sql_validation")
    if not isinstance(sv, dict) or not sv:
        return "Блок валидации SQL в trace отсутствует или ещё не заполнен."

    gri = sv.get("guardrail_explainability")
    if isinstance(gri, dict):
        summary = str(gri.get("reason_summary_ru") or "").strip()
        snap = gri.get("policy_snapshot")
        extra = ""
        if isinstance(snap, dict):
            parts = []
            if snap.get("select_only"):
                parts.append("только SELECT")
            if snap.get("table_whitelist_enabled"):
                parts.append("whitelist таблиц")
            if snap.get("column_whitelist_enabled"):
                parts.append("whitelist колонок")
            lim = snap.get("default_limit")
            if lim is not None:
                parts.append(f"LIMIT по умолчанию ≤ {lim}")
            if parts:
                extra = " Ключевые гарантии: " + ", ".join(parts) + "."
        if summary:
            return _truncate(summary + extra, 900)
    if output.sql_validation is not None:
        return "SQL прошёл встроенный валидатор; подробности см. sql_validation в техническом trace."
    return "Состояние SQL guardrails не удалось кратко описать."


def _guardrails_result_ru(tp: dict[str, Any]) -> str:
    g = tp.get("guardrails")
    if isinstance(g, dict) and g.get("blocked"):
        codes = g.get("codes")
        code_s = ", ".join(str(c) for c in codes) if isinstance(codes, list) else ""
        msgs = g.get("messages_ru")
        msg_s = " ".join(str(m) for m in msgs) if isinstance(msgs, list) else ""
        base = "Guardrails оркестратора: запрос заблокирован."
        if code_s:
            base += f" Коды: {code_s}."
        if msg_s:
            base += " " + _truncate(msg_s, 400)
        return _truncate(base, 800)

    sv = tp.get("sql_validation")
    if isinstance(sv, dict):
        gri = sv.get("guardrail_explainability")
        if isinstance(gri, dict):
            dec = str(gri.get("decision") or "").strip()
            rules = gri.get("triggered_rules")
            rs = ""
            if isinstance(rules, list) and rules:
                rs = " Сработавшие правила: " + ", ".join(str(r) for r in rules[:12]) + "."
            if dec == "allowed":
                return "Guardrails SQL: решение «разрешено»; сработали проверки whitelist и политики роли." + rs
            if dec == "rejected":
                err = gri.get("errors")
                e0 = str(err[0]) if isinstance(err, list) and err else ""
                return _truncate("Guardrails SQL: отклонено." + (f" Причина: {e0}." if e0 else "") + rs, 800)
            return _truncate(str(gri.get("reason_summary_ru") or "Guardrails SQL: см. технический trace.") + rs, 800)

    if bool(tp.get("general_conversation")):
        return "Guardrails SQL для запроса к БД не задействованы (режим общего ответа)."

    return "Явных срабатываний guardrails в trace не зафиксировано; запрос обработан в обычном контуре."


def _clarification_ru(tp: dict[str, Any], *, output: OrchestrationOutput) -> str:
    clar = tp.get("clarification")
    if not isinstance(clar, dict):
        clar = {}
    required = bool(clar.get("clarification_required")) or output.execution_status == "clarification_required"
    if not required:
        return ""
    clar_obj = output.clarification
    fallback_q = clar_obj.clarification_question if clar_obj is not None else ""
    q = str(clar.get("clarification_question") or fallback_q or "").strip()
    reason = str(clar.get("clarification_reason") or "").strip()
    summary = str(clar.get("clarification_reason_summary_ru") or "").strip() or clarification_reason_summary_ru(reason)
    opts = clar.get("clarification_options")
    opt_labels: list[str] = []
    if isinstance(opts, list):
        for o in opts[:8]:
            if isinstance(o, dict) and o.get("label"):
                opt_labels.append(str(o["label"]))
    parts = ["Требуется уточнение от пользователя."]
    if summary:
        parts.append(summary)
    if q:
        parts.append(f"Вопрос: {q}")
    if opt_labels:
        parts.append("Варианты: " + "; ".join(opt_labels))
    return _truncate(" ".join(parts), 900)


def _metric_explanation(struct: dict[str, Any], tp: dict[str, Any], output: OrchestrationOutput) -> str:
    terms = _semantic_terms_lines(tp)
    if terms:
        return "Метрика из словаря данных: " + terms[0] + (f" (+ещё {len(terms) - 1} термин(ов))" if len(terms) > 1 else "")
    m = str(struct.get("metric") or "").strip()
    metrics = struct.get("metrics")
    if isinstance(metrics, list) and metrics:
        m = str(metrics[0])
    if not m and output.semantic_resolutions:
        m = str(output.semantic_resolutions[0].term_key or "")
    if not m:
        ent = tp.get("entities")
        if isinstance(ent, dict):
            m = str(ent.get("canonical_metric_key") or ent.get("metric_hint") or "").strip()
    qe = tp.get("query_explanation")
    if isinstance(qe, dict):
        line = str(qe.get("metric_summary_ru") or "").strip()
        if line and not m:
            return line
        if line and m:
            return f"{line} (канонический ключ: {m})."
    if m:
        return f"Основная метрика запроса (канонический ключ): {m}."
    return "Метрика задана шаблоном SQL или эвристикой движка без явного термина в словаре."


def _chart_ru(tp: dict[str, Any], output: OrchestrationOutput) -> str:
    ch = tp.get("chart")
    if isinstance(ch, dict):
        r = str(ch.get("rationale") or "").strip()
        ct = str(ch.get("chart_type") or "").strip()
        if r and ct:
            return _truncate(f"Тип визуализации: {ct}. {r}", 800)
        if r:
            return _truncate(r, 800)
    r2 = (output.chart.rationale or "").strip()
    ct2 = (output.chart.chart_type or "").strip()
    if r2:
        return _truncate(f"Тип визуализации: {ct2}. {r2}", 800) if ct2 else _truncate(r2, 800)
    return "Таблица или график подобраны эвристикой рекомендателя по intent и форме результата."


def build_human_trace_ru(*, trace_payload: dict[str, Any], output: OrchestrationOutput) -> dict[str, Any]:
    """Возвращает словарь для ключа trace_payload['human_trace'] (русские пояснения для UI)."""
    tp = trace_payload
    struct = _structured(tp)
    guard = tp.get("guardrails")
    guard_blocked = isinstance(guard, dict) and bool(guard.get("blocked"))
    general = bool(tp.get("general_conversation"))

    raw_q = str(output.preprocessed_query or "").strip()
    eff = str(tp.get("effective_query") or output.effective_query or "").strip()
    question = eff or raw_q
    if raw_q and eff and raw_q != eff:
        question = f"{eff} (исходная формулировка: {raw_q})"

    intent = str(struct.get("intent") or tp.get("intent") or output.intent or "").strip()
    intent_human = _INTENT_RU.get(intent, "аналитический запрос к данным заказов")
    intent_explanation = (
        f"Система классифицировала запрос как intent «{intent}»: {intent_human}."
        if intent
        else "Intent не классифицирован однозначно; см. технический trace."
    )

    terms_lines = _semantic_terms_lines(tp)
    if terms_lines:
        business_terms_explanation = "Найденные бизнес-термины (сопоставление с данными): " + "; ".join(
            terms_lines[:8]
        )
        if len(terms_lines) > 8:
            business_terms_explanation += f" … всего {len(terms_lines)}."
    else:
        business_terms_explanation = (
            "Явных терминов из семантического словаря в запросе не выделено — использованы значения по умолчанию шаблона."
            if not general
            else "Семантический слой для SQL не вызывался."
        )

    dims = struct.get("dimensions")
    dim_list = [str(d) for d in dims] if isinstance(dims, list) else []
    grouping = struct.get("grouping")
    grp_list = [str(g) for g in grouping] if isinstance(grouping, list) else []

    if dim_list:
        dimension_explanation = "Измерения (срезы) из интерпретации: " + ", ".join(dim_list) + "."
    elif grp_list:
        dimension_explanation = "Явный список измерений пуст; группировка задаёт срез данных."
    else:
        dimension_explanation = "Отдельные измерения в интерпретации не выделены — возможна только агрегатная сводка."

    if grp_list:
        grouping_explanation = "Группировка результата по полям: " + ", ".join(grp_list) + "."
    else:
        grouping_explanation = (
            "Группировка задана шаблоном SQL (например, только агрегат по времени/метрике) или отсутствует."
        )

    tr = struct.get("time_range")
    period_explanation = ""
    if isinstance(tr, dict):
        label = str(tr.get("label_ru") or "").strip()
        preset = str(tr.get("preset") or "").strip()
        if label:
            period_explanation = f"Период: {label}."
        elif preset and preset != "unknown":
            period_explanation = f"Период нормализован как preset «{preset}»."
    if not period_explanation:
        ent = tp.get("entities")
        if isinstance(ent, dict):
            if ent.get("time_period"):
                period_explanation = f"В сущностях указан time_period={ent.get('time_period')}."
            elif ent.get("window_days") is not None:
                period_explanation = f"Скользящее окно: {ent.get('window_days')} дней."
            elif ent.get("calendar_year") is not None:
                period_explanation = f"Календарный год данных: {ent.get('calendar_year')}."
    if not period_explanation:
        period_explanation = "Явный период в запросе не выделен или задан через шаблон по умолчанию."

    filter_parts = _filters_from_structured(struct)
    qe = tp.get("query_explanation")
    if not filter_parts and isinstance(qe, dict):
        fa = qe.get("filters_applied")
        if isinstance(fa, list) and fa:
            filter_parts = [str(x) for x in fa[:24]]
    if filter_parts:
        filters_explanation = "Фильтры (WHERE / сущности): " + "; ".join(filter_parts) + "."
    else:
        filters_explanation = "Дополнительных фильтров поверх периода и измерений не зафиксировано."

    return {
        "question": _truncate(question, 500),
        "intent_explanation": _truncate(intent_explanation, 500),
        "business_terms_explanation": _truncate(business_terms_explanation, 900),
        "metric_explanation": _truncate(_metric_explanation(struct, tp, output), 800),
        "grouping_explanation": _truncate(grouping_explanation, 500),
        "dimension_explanation": _truncate(dimension_explanation, 500),
        "period_explanation": _truncate(period_explanation, 500),
        "filters_explanation": _truncate(filters_explanation, 800),
        "sql_generation_explanation": _truncate(
            _sql_generation_ru(tp, general_conversation=general, guard_blocked=guard_blocked),
            800,
        ),
        "sql_safety_explanation": _truncate(_sql_safety_ru(tp, output=output, guard_blocked=guard_blocked), 900),
        "chart_explanation": _chart_ru(tp, output),
        "confidence": float(output.confidence_score),
        "clarification_explanation": _clarification_ru(tp, output=output),
        "guardrails_explanation": _truncate(_guardrails_result_ru(tp), 900),
    }
