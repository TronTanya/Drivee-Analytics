from __future__ import annotations

import time

from sqlalchemy import create_engine, text

from app.core.config import settings


def main() -> None:
    max_attempts = 30
    delay_seconds = 2
    engine = create_engine(settings.database_url, pool_pre_ping=True)

    for attempt in range(1, max_attempts + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            print(f"PostgreSQL is ready (attempt {attempt}/{max_attempts}).")
            return
        except Exception as exc:  # noqa: BLE001
            print(f"Waiting for PostgreSQL ({attempt}/{max_attempts}): {exc}")
            time.sleep(delay_seconds)

    raise RuntimeError("PostgreSQL is not ready after waiting period.")


if __name__ == "__main__":
    main()
