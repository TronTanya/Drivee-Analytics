"""Схемы для suite оценки корректности SQL (фрагменты, таблицы, опционально полное совпадение после нормализации)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

EvaluationMode = Literal["live", "mock", "deterministic"]


class SqlCorrectnessChecksSpec(BaseModel):
    """Ожидания по сгенерированному SQL (после успешной генерации и валидации в пайплайне)."""

    required_fragments_normalized: list[str] = Field(
        default_factory=list,
        description="Подстроки в SQL после normalize_for_checks (lower + схлопывание пробелов).",
    )
    forbidden_fragments_normalized: list[str] = Field(
        default_factory=list,
        description="Запрещённые подстроки в нормализованном SQL.",
    )
    required_tables: list[str] = Field(
        default_factory=list,
        description="Базовые имена физических таблиц (без схемы), должны присутствовать в FROM/JOIN.",
    )
    gold_normalized_sql: Optional[str] = Field(
        default=None,
        description="Если задано — normalize_for_checks(actual) должен совпасть с normalize_for_checks(gold).",
    )
    reference_sql_live: Optional[str] = Field(
        default=None,
        description="Эталонный SQL для live-сравнения скаляра (выполняется только в mode=live).",
    )
    compare_scalar_in_live: bool = Field(
        default=False,
        description="Если true и задан reference_sql_live — сравниваем scalar(actual_sql) == scalar(reference_sql_live).",
    )
    min_train_rows_for_live_compare: int = Field(
        default=0,
        ge=0,
        description="Минимальное число строк в public.train для live scalar compare; иначе check помечается skipped.",
    )
    expected_columns: list[str] = Field(
        default_factory=list,
        description="Имена колонок/алиасов, которые должны встречаться в нормализованном SQL.",
    )
    sql_must_contain: list[str] = Field(
        default_factory=list,
        description="Подстроки в исходном SQL (case-insensitive), как в NL golden.",
    )
    sql_must_not_contain: list[str] = Field(
        default_factory=list,
        description="Запрещённые подстроки в исходном SQL (case-insensitive).",
    )
    result_shape: list[str] = Field(
        default_factory=list,
        description="Ожидаемые имена колонок результата (проверка в live через LIMIT 0 или эвристика по SELECT).",
    )
    require_sql_validation_pass: bool = True


class SqlCorrectnessCase(BaseModel):
    id: str
    prompt: str
    role: str = "manager"
    checks: SqlCorrectnessChecksSpec = Field(default_factory=SqlCorrectnessChecksSpec)


class SqlCorrectnessDatasetFile(BaseModel):
    version: int = 1
    description: str = ""
    cases: list[SqlCorrectnessCase] = Field(default_factory=list)


class SqlCorrectnessCaseChecks(BaseModel):
    fragments: bool = True
    forbidden: bool = True
    tables: bool = True
    columns: bool = True
    sql_must: bool = True
    result_shape: bool = True
    gold_normalized: bool = True
    scalar_live: bool = True
    sql_validation: bool = True
    generated_non_empty: bool = True


class SqlCorrectnessCaseResult(BaseModel):
    id: str
    prompt: str
    passed: bool
    score: float = Field(ge=0.0, le=1.0)
    checks: SqlCorrectnessCaseChecks
    expected: dict[str, Any]
    actual: dict[str, Any]
    failure_reason: Optional[str] = None


class SqlCorrectnessSummary(BaseModel):
    total_cases: int = 0
    passed_cases: int = 0
    failed_cases: int = 0
    overall_accuracy: float = Field(default=0.0, ge=0.0, le=1.0)
    fragment_pass_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    table_pass_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    gold_exact_pass_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    live_scalar_pass_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    live_scalar_coverage: float = Field(default=0.0, ge=0.0, le=1.0)
    sql_validation_pass_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    updated_at: str = ""
    mode: EvaluationMode = "mock"


class SqlCorrectnessRunRequest(BaseModel):
    mode: EvaluationMode = "mock"


class SqlCorrectnessRunResponse(BaseModel):
    summary: SqlCorrectnessSummary
    case_results: list[SqlCorrectnessCaseResult] = Field(default_factory=list)


class SqlCorrectnessCasePublic(BaseModel):
    id: str
    prompt: str
    role: str


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
