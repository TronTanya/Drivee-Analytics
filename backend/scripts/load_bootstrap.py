import os
from pathlib import Path

import psycopg2


def get_connection():
    return psycopg2.connect(
        host=os.getenv("PGHOST", "localhost"),
        port=int(os.getenv("PGPORT", "5432")),
        dbname=os.getenv("PGDATABASE", "drivee_analytics"),
        user=os.getenv("PGUSER", "postgres"),
        password=os.getenv("PGPASSWORD", "postgres"),
    )


def main() -> None:
    sql_path = Path(__file__).resolve().parents[1] / "sql" / "bootstrap_drivee.sql"
    sql = sql_path.read_text(encoding="utf-8")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()

    print("Bootstrap applied successfully.")


if __name__ == "__main__":
    main()
