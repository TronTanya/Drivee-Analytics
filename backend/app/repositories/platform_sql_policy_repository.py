from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.platform_sql_policy import PlatformSqlPolicy

SINGLETON_ID = 1


class PlatformSqlPolicyRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_singleton(self) -> PlatformSqlPolicy:
        row = self._session.get(PlatformSqlPolicy, SINGLETON_ID)
        if row is None:
            row = PlatformSqlPolicy(
                id=SINGLETON_ID,
                extra_whitelist_tables=[],
                extra_whitelist_columns=[],
                nl_max_result_rows=None,
            )
            self._session.add(row)
            self._session.commit()
            self._session.refresh(row)
        return row

    def update_singleton(
        self,
        *,
        extra_tables: list[str],
        extra_columns: list[str],
        nl_max_result_rows: int | None,
    ) -> PlatformSqlPolicy:
        row = self.get_singleton()
        row.extra_whitelist_tables = list(extra_tables)
        row.extra_whitelist_columns = list(extra_columns)
        row.nl_max_result_rows = nl_max_result_rows
        self._session.add(row)
        self._session.commit()
        self._session.refresh(row)
        return row
