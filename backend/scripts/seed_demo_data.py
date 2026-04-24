from __future__ import annotations

import os
from datetime import timedelta
from decimal import Decimal

from sqlalchemy import select

from app.core.security import hash_password, verify_password
from app.db.session import SessionLocal
from app.models.analytics_history import NLQueryHistory
from app.models.notebook import Notebook, NotebookCell
from app.models.query_template import QueryTemplate
from app.models.role import Role
from app.models.saved_report import SavedReport
from app.models.semantic import SemanticTerm, SemanticTermSynonym
from app.models.user import User
from app.models.user_profile import UserProfile
from app.models.workspace import Workspace, WorkspaceMembership

from app.demo_data.seed_analytics_orders import replace_demo_orders_dataset

DEFAULT_ROLES = [
    ("admin", "Administrator"),
    ("manager", "Manager"),
    ("marketer", "Marketer"),
    ("executive", "Executive"),
]

# Документированный демо-пароль (см. docs/demo-users-credentials.md).
KNOWN_DEMO_PLAIN_PASSWORD = "demo123"


def ensure_demo_password_hash(user: User) -> None:
    """Если хеш в БД не соответствует демо-паролю (старый bootstrap, смена passlib и т.д.) — перезаписываем."""
    if not user.is_demo_user:
        return
    try:
        if verify_password(KNOWN_DEMO_PLAIN_PASSWORD, user.password_hash):
            return
    except Exception:
        pass
    user.password_hash = hash_password(KNOWN_DEMO_PLAIN_PASSWORD)


def ensure_roles(session) -> dict[str, Role]:
    out: dict[str, Role] = {}
    for role_key, role_name in DEFAULT_ROLES:
        role = session.scalar(select(Role).where(Role.role_key == role_key))
        if role is None:
            role = Role(role_key=role_key, role_name=role_name, description=f"Seeded role: {role_name}")
            session.add(role)
            session.flush()
        out[role_key] = role
    return out


def ensure_admin_user(session, admin_role: Role) -> User:
    email = "admin@drivee.local"
    user = session.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            email=email,
            password_hash=hash_password("demo123"),
            is_active=True,
            is_demo_user=True,
            role_id=admin_role.id,
        )
        session.add(user)
        session.flush()
    ensure_demo_password_hash(user)
    return user


def ensure_demo_users(session, roles: dict[str, Role]) -> dict[str, User]:
    users: dict[str, User] = {}
    seeds = [
        ("admin@drivee.local", "admin", "Admin", "User"),
        ("manager@drivee.local", "manager", "Masha", "Manager"),
        ("marketer@drivee.local", "marketer", "Max", "Marketer"),
        ("executive@drivee.local", "executive", "Eva", "Executive"),
    ]
    for email, role_key, first_name, last_name in seeds:
        user = session.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                email=email,
                password_hash=hash_password("demo123"),
                is_active=True,
                is_demo_user=True,
                role_id=roles[role_key].id,
            )
            session.add(user)
            session.flush()
        ensure_demo_password_hash(user)
        profile = session.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
        if profile is None:
            profile = UserProfile(
                user_id=user.id,
                first_name=first_name,
                last_name=last_name,
                timezone="Europe/Moscow",
                locale="ru",
                profile_json={"department": role_key},
            )
            session.add(profile)
        users[role_key] = user
    return users


def ensure_workspace(session, owner: User, admin_role: Role) -> Workspace:
    workspace = session.scalar(select(Workspace).where(Workspace.slug == "demo-workspace"))
    if workspace is None:
        workspace = Workspace(
            name="Drivee Demo Workspace",
            slug="demo-workspace",
            owner_user_id=owner.id,
            settings_json={},
        )
        session.add(workspace)
        session.flush()

    membership = session.scalar(
        select(WorkspaceMembership).where(
            WorkspaceMembership.workspace_id == workspace.id,
            WorkspaceMembership.user_id == owner.id,
        )
    )
    if membership is None:
        membership = WorkspaceMembership(
            workspace_id=workspace.id,
            user_id=owner.id,
            role_id=admin_role.id,
            is_default_workspace=True,
        )
        session.add(membership)
    return workspace


def ensure_workspace_memberships(session, workspace: Workspace, users: dict[str, User], roles: dict[str, Role]) -> None:
    for role_key, user in users.items():
        membership = session.scalar(
            select(WorkspaceMembership).where(
                WorkspaceMembership.workspace_id == workspace.id,
                WorkspaceMembership.user_id == user.id,
            )
        )
        if membership is None:
            session.add(
                WorkspaceMembership(
                    workspace_id=workspace.id,
                    user_id=user.id,
                    role_id=roles[role_key].id,
                    is_default_workspace=(role_key == "admin"),
                )
            )


def ensure_semantic_terms(session, workspace: Workspace, admin_user: User, admin_role: Role) -> None:
    terms = [
        ("orders_count", "Количество заказов", "COUNT(*)", ["заказы", "orders", "количество заказов"]),
        (
            "done_rides",
            "Завершенные поездки",
            "COUNT(DISTINCT CASE WHEN a.driverdone_timestamp IS NOT NULL THEN a.order_id END)",
            ["завершенные поездки", "done rides"],
        ),
        ("client_cancellations", "Отмены клиентом", "COUNT(CASE WHEN a.clientcancel_timestamp IS NOT NULL THEN 1 END)", ["отмены клиентом", "client cancellations"]),
        ("driver_cancellations", "Отмены водителем", "COUNT(CASE WHEN a.drivercancel_timestamp IS NOT NULL THEN 1 END)", ["отмены водителем", "driver cancellations"]),
        ("avg_order_price", "Средняя стоимость заказа", "AVG(a.price_order_local)", ["средняя стоимость", "average order price"]),
        ("sum_order_price", "Суммарная стоимость заказов", "SUM(a.price_order_local)", ["суммарная стоимость", "total order price"]),
    ]
    for term_key, display_name, sql_expression, synonyms in terms:
        term = session.scalar(
            select(SemanticTerm).where(SemanticTerm.workspace_id == workspace.id, SemanticTerm.term_key == term_key)
        )
        if term is None:
            term = SemanticTerm(
                workspace_id=workspace.id,
                visible_role_id=admin_role.id,
                term_key=term_key,
                display_name=display_name,
                sql_expression=sql_expression,
                description=f"Demo semantic term: {display_name}",
                created_by=admin_user.id,
            )
            session.add(term)
            session.flush()
        for syn in synonyms:
            exists = session.scalar(
                select(SemanticTermSynonym).where(
                    SemanticTermSynonym.term_id == term.id,
                    SemanticTermSynonym.normalized_synonym == syn.lower(),
                )
            )
            if exists is None:
                session.add(
                    SemanticTermSynonym(
                        term_id=term.id,
                        synonym=syn,
                        normalized_synonym=syn.lower(),
                    )
                )


def _template_target_role_key(template_key: str) -> str | None:
    """None — шаблон доступен всем ролям; иначе ключ роли (manager/marketer/executive)."""
    shared_all_roles = {
        "weekly_cancellations_by_city",
        "daily_done_rides",
        "daily_orders_trend",
        "trips_by_city",
        "cancellations_by_period",
        "cancel_rate_by_city",
        "weekly_conversion",
        "orders_trend_30d",
    }
    executive_keys = {
        "revenue_by_city_last_month",
        "top5_cities_by_revenue",
    }
    marketer_keys = {
        "conversion_by_channel",
        "orders_dynamics",
        "orders_count_by_channel",
        "avg_check_by_order_channel",
    }
    if template_key in shared_all_roles:
        return None
    if template_key in executive_keys:
        return "executive"
    if template_key in marketer_keys:
        return "marketer"
    return "manager"


def ensure_query_templates(session, workspace: Workspace, users: dict[str, User], roles: dict[str, Role]) -> None:
    # (key, title, description, nl_prompt, chart, sql) — SQL только к public.train и whitelisted-колонкам.
    templates: list[tuple[str, str, str, str, str, str]] = [
        (
            "weekly_cancellations_by_city",
            "Отмены по городам за неделю",
            "Количество отмен по city_id за 7 дней",
            "Покажи количество отмен по city_id за прошлую неделю",
            "bar",
            "SELECT city_id, COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL)::bigint AS cancellations FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '7 day') GROUP BY 1 ORDER BY 2 DESC",
        ),
        (
            "daily_done_rides",
            "Завершенные поездки по дням",
            "Завершённые поездки по дням за 14 дней",
            "Сравни количество завершенных поездок по дням за 14 дней",
            "line",
            "SELECT date_trunc('day', order_timestamp)::date AS day, COUNT(*) FILTER (WHERE driverdone_timestamp IS NOT NULL)::bigint AS done_rides FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '14 day') GROUP BY 1 ORDER BY 1",
        ),
        (
            "avg_price_by_city",
            "Средняя стоимость заказа по city_id",
            "AVG(price_order_local) по city_id по всему доступному окну",
            "Покажи среднюю стоимость заказа по городам",
            "bar",
            "SELECT city_id, AVG(price_order_local)::numeric(18,2) AS avg_order_price FROM public.train GROUP BY 1 ORDER BY 2 DESC",
        ),
        (
            "daily_orders_trend",
            "Динамика заказов по дням",
            "Число заказов по дням за 7 дней",
            "Покажи динамику заказов за последние 7 дней",
            "line",
            "SELECT date_trunc('day', order_timestamp)::date AS day, COUNT(DISTINCT order_id)::bigint AS orders_count FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '7 day') GROUP BY 1 ORDER BY 1",
        ),
        (
            "cancel_rate_by_city",
            "Доля отмен по городам",
            "Доля строк с отменой к заказам по city_id за 14 дней",
            "Покажи cancellation rate по городам за 14 дней",
            "bar",
            "SELECT city_id, (COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL))::numeric / NULLIF(COUNT(DISTINCT order_id),0) AS cancellation_rate FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '14 day') GROUP BY 1 ORDER BY 2 DESC",
        ),
        (
            "retention_proxy_daily",
            "Retention proxy по дням",
            "Доля завершённых по дням (эвристика)",
            "Покажи ежедневную долю завершенных заказов",
            "line",
            "SELECT date_trunc('day', order_timestamp)::date AS day, (COUNT(*) FILTER (WHERE driverdone_timestamp IS NOT NULL))::numeric / NULLIF(COUNT(DISTINCT order_id),0) AS done_share FROM public.train GROUP BY 1 ORDER BY 1",
        ),
        (
            "trips_by_city",
            "Поездки по городам",
            "Завершённые поездки по city_id за 14 дней",
            "Покажи количество завершённых поездок по city_id за последние 14 дней",
            "bar",
            "SELECT city_id, COUNT(*) FILTER (WHERE driverdone_timestamp IS NOT NULL)::bigint AS done_rides FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '14 day') GROUP BY 1 ORDER BY 2 DESC",
        ),
        (
            "cancellations_by_period",
            "Динамика отмен по дням",
            "Отмены по дням за 30 дней",
            "Покажи количество отменённых заказов по дням за последние 30 дней",
            "line",
            "SELECT date_trunc('day', order_timestamp)::date AS day, COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL)::bigint AS cancellations FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 1",
        ),
        (
            "weekly_conversion",
            "Недели: конверсия в завершение",
            "Доля завершённых по календарным неделям за 8 недель",
            "Покажи долю завершённых заказов по неделям за последние 8 недель",
            "line",
            "SELECT date_trunc('week', order_timestamp)::date AS week, (COUNT(*) FILTER (WHERE driverdone_timestamp IS NOT NULL))::numeric / NULLIF(COUNT(DISTINCT order_id),0) AS conversion_rate FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '56 day') GROUP BY 1 ORDER BY 1",
        ),
        (
            "avg_check_by_city",
            "Средний чек по городам",
            "Средний price_order_local по city_id за 30 дней",
            "Покажи средний чек заказа (price_order_local) по city_id за последние 30 дней",
            "bar",
            "SELECT city_id, AVG(price_order_local)::numeric(18,2) AS avg_check FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 2 DESC",
        ),
        (
            "orders_dynamics",
            "Динамика заказов (14 дней)",
            "Число заказов по дням за 14 дней",
            "Покажи динамику числа заказов по дням за последние 14 дней",
            "line",
            "SELECT date_trunc('day', order_timestamp)::date AS day, COUNT(DISTINCT order_id)::bigint AS orders_count FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '14 day') GROUP BY 1 ORDER BY 1",
        ),
        (
            "wow_done_rides_by_city",
            "Завершённые поездки: эта неделя vs прошлая",
            "Сравнение done по city_id за текущую и прошлую неделю",
            "Сравни количество завершённых поездок по city_id за текущую и предыдущую календарную неделю",
            "bar",
            "SELECT city_id, COUNT(*) FILTER (WHERE driverdone_timestamp IS NOT NULL AND order_timestamp >= date_trunc('week', CURRENT_DATE) AND order_timestamp < date_trunc('week', CURRENT_DATE) + interval '7 day')::bigint AS done_this_week, COUNT(*) FILTER (WHERE driverdone_timestamp IS NOT NULL AND order_timestamp >= date_trunc('week', CURRENT_DATE) - interval '7 day' AND order_timestamp < date_trunc('week', CURRENT_DATE))::bigint AS done_prev_week FROM public.train WHERE order_timestamp >= date_trunc('week', CURRENT_DATE) - interval '14 day' GROUP BY 1 ORDER BY 1",
        ),
        (
            "conversion_by_channel",
            "Конверсия по каналам заказа",
            "Доля завершённых по order_channel за 28 дней",
            "Покажи конверсию в завершённую поездку по order_channel за 28 дней",
            "bar",
            "SELECT order_channel, (COUNT(*) FILTER (WHERE driverdone_timestamp IS NOT NULL))::numeric / NULLIF(COUNT(DISTINCT order_id), 0) AS conversion_rate, COUNT(DISTINCT order_id)::bigint AS orders FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '28 day') GROUP BY 1 ORDER BY 3 DESC",
        ),
        (
            "revenue_by_city_last_month",
            "Выручка по городам (30 дней)",
            "Сумма price_order_local по city_id за последние 30 дней",
            "Покажи выручку по городам за последний месяц",
            "bar",
            "SELECT city_id, SUM(price_order_local)::numeric(18,2) AS revenue_local FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 2 DESC",
        ),
        (
            "orders_count_by_channel",
            "Заказы по каналам",
            "Сравнение объёма заказов по order_channel за 28 дней",
            "Сравни количество заказов по каналам",
            "bar",
            "SELECT order_channel, COUNT(DISTINCT order_id)::bigint AS orders_count FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '28 day') GROUP BY 1 ORDER BY 2 DESC",
        ),
        (
            "top5_cities_by_revenue",
            "Топ-5 городов по выручке",
            "Сумма price_order_local за 30 дней, LIMIT 5",
            "Покажи топ-5 городов по выручке",
            "bar",
            "SELECT city_id, SUM(price_order_local)::numeric(18,2) AS revenue_local FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 2 DESC LIMIT 5",
        ),
        (
            "orders_week_over_week",
            "Заказы: неделя к неделе",
            "Сравнение числа заказов текущая vs прошлая календарная неделя",
            "Сравни недели между собой по числу заказов",
            "bar",
            "SELECT COUNT(*) FILTER (WHERE order_timestamp >= date_trunc('week', CURRENT_DATE) - interval '7 day' AND order_timestamp < date_trunc('week', CURRENT_DATE))::bigint AS orders_prev_week, COUNT(*) FILTER (WHERE order_timestamp >= date_trunc('week', CURRENT_DATE) AND order_timestamp < date_trunc('week', CURRENT_DATE) + interval '7 day')::bigint AS orders_this_week FROM public.train WHERE order_timestamp >= date_trunc('week', CURRENT_DATE) - interval '14 day'",
        ),
        (
            "avg_check_by_order_channel",
            "Средний чек по каналам (сегменты)",
            "Средний price_order_local по order_channel (категория = канал продаж) за 30 дней",
            "Покажи средний чек по категориям",
            "bar",
            "SELECT order_channel, AVG(price_order_local)::numeric(18,2) AS avg_check FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 2 DESC",
        ),
        (
            "orders_trend_30d",
            "Тренд заказов за 30 дней",
            "Число заказов по дням за 30 дней",
            "Покажи тренд заказов за 30 дней",
            "line",
            "SELECT date_trunc('day', order_timestamp)::date AS day, COUNT(DISTINCT order_id)::bigint AS orders_count FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 1",
        ),
    ]
    for template_key, template_name, description, nl_template, chart, sql_template in templates:
        tpl = session.scalar(
            select(QueryTemplate).where(
                QueryTemplate.workspace_id == workspace.id,
                QueryTemplate.template_key == template_key,
            )
        )
        rkey = _template_target_role_key(template_key)
        target_rid = roles[rkey].id if rkey else None
        if tpl is None:
            session.add(
                QueryTemplate(
                    workspace_id=workspace.id,
                    target_role_id=target_rid,
                    template_key=template_key,
                    template_name=template_name,
                    description=description,
                    nl_prompt_template=nl_template,
                    sql_template=sql_template,
                    default_chart_type=chart,
                    created_by=users["admin"].id,
                )
            )


def ensure_business_demo_data(session, workspace: Workspace) -> None:
    if os.getenv("SKIP_DEMO_TRAIN_SEED", "false").strip().lower() in {"1", "true", "yes", "on"}:
        print("Skipping demo train seed: SKIP_DEMO_TRAIN_SEED=true")
        return
    n = replace_demo_orders_dataset(session)
    _ = workspace
    if n:
        print(f"Seeded train (view over orders) demo bulk rows: {n}")


def ensure_demo_notebook_and_history(session, workspace: Workspace, admin_user: User) -> None:
    notebook = session.scalar(
        select(Notebook).where(Notebook.workspace_id == workspace.id, Notebook.title == "Demo In-city Orders Notebook")
    )
    if notebook is None:
        notebook = Notebook(
            workspace_id=workspace.id,
            owner_user_id=admin_user.id,
            title="Demo In-city Orders Notebook",
            description="Notebook with cancellation, completion and pricing scenarios.",
            notebook_status="active",
            context_chain_json={"seed": True},
        )
        session.add(notebook)
        session.flush()

    cell = session.scalar(
        select(NotebookCell).where(NotebookCell.notebook_id == notebook.id, NotebookCell.position == 1)
    )
    if cell is None:
        cell = NotebookCell(
            notebook_id=notebook.id,
            cell_type="analysis",
            position=1,
            prompt_text="Покажи количество отмен по city_id за прошлую неделю",
            interpreted_intent={"intent": "comparison"},
            extracted_entities_json={"time_period": "last_week", "dimension": "city_id"},
            semantic_terms_json=[{"term_key": "client_cancellations"}],
            generated_sql="SELECT city_id, COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL) AS cancellations FROM public.train WHERE order_timestamp >= CURRENT_DATE - INTERVAL '7 day' GROUP BY city_id;",
            validation_status="passed",
            execution_status="succeeded",
            chart_type="bar",
            selected_chart_type="bar",
            insight_text="Лидеры по отменам сконцентрированы в ограниченном наборе city_id.",
            confidence_score=Decimal("0.84"),
            clarification_required=False,
            context_snapshot_json={"active_filters": {}},
            trace_payload_json={"seed": True},
            forecast_payload_json={},
            created_by=admin_user.id,
        )
        session.add(cell)
        session.flush()

    history = session.scalar(
        select(NLQueryHistory).where(
            NLQueryHistory.notebook_id == notebook.id,
            NLQueryHistory.original_query == "Покажи количество отмен по city_id за прошлую неделю",
        )
    )
    if history is None:
        session.add(
            NLQueryHistory(
                workspace_id=workspace.id,
                user_id=admin_user.id,
                notebook_id=notebook.id,
                notebook_cell_id=cell.id,
                original_query="Покажи количество отмен по city_id за прошлую неделю",
                resolved_query="Покажи количество отмен по city_id за прошлую неделю",
                interpreted_intent="comparison",
                semantic_terms_json=[{"term_key": "client_cancellations", "surface_form": "отмены клиентом"}],
                generated_sql="SELECT city_id, COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL) AS cancellations FROM public.train GROUP BY city_id;",
                validation_result_json={"status": "passed"},
                execution_status="succeeded",
                trace_payload_json={"confidence": 0.84},
            )
        )

    report = session.scalar(select(SavedReport).where(SavedReport.workspace_id == workspace.id, SavedReport.title == "Weekly cancellations"))
    if report is None:
        session.add(
            SavedReport(
                workspace_id=workspace.id,
                notebook_id=notebook.id,
                title="Weekly cancellations",
                description="Seeded report for demo schedule flow.",
                report_payload_json={"chart_type": "bar", "sql": "SELECT city_id, COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL) AS cancellations FROM public.train GROUP BY city_id;"},
                created_by=admin_user.id,
                is_shared=True,
            )
        )


def main() -> None:
    with SessionLocal() as session:
        roles = ensure_roles(session)
        admin = ensure_admin_user(session, roles["admin"])
        users = ensure_demo_users(session, roles)
        workspace = ensure_workspace(session, admin, roles["admin"])
        ensure_workspace_memberships(session, workspace, users, roles)
        ensure_semantic_terms(session, workspace, users["admin"], roles["admin"])
        ensure_query_templates(session, workspace, users, roles)
        ensure_business_demo_data(session, workspace)
        ensure_demo_notebook_and_history(session, workspace, users["admin"])
        ensure_defense_demo_history(session, workspace, users["admin"])
        session.commit()
    print("Demo seed completed (idempotent, platform-wide).")


def ensure_defense_demo_history(session, workspace: Workspace, admin_user: User) -> None:
    """История NL под четыре сценария защиты (идемпотентно по тексту запроса)."""
    notebook = session.scalar(
        select(Notebook).where(
            Notebook.workspace_id == workspace.id,
            Notebook.title == "Demo In-city Orders Notebook",
        )
    )
    if notebook is None:
        return
    seeds: list[tuple[str, str, str]] = [
        ("def_quick", "Покажи топ-3 города по количеству отменённых заказов на этой неделе", "ranking"),
        ("def_compare", "Сравни долю завершённых заказов Алматы и Астана за последние 14 дней", "comparison"),
        ("def_reporting", "Сводка для операционного дашборда: отмены по дням за последние 7 дней", "timeseries"),
        (
            "def_templates",
            "Из каталога шаблонов: отмены по городам за неделю (weekly_cancellations_by_city)",
            "template_run",
        ),
    ]
    for scenario_id, query, intent in seeds:
        exists = session.scalar(
            select(NLQueryHistory).where(
                NLQueryHistory.notebook_id == notebook.id,
                NLQueryHistory.original_query == query,
            )
        )
        if exists is not None:
            continue
        session.add(
            NLQueryHistory(
                workspace_id=workspace.id,
                user_id=admin_user.id,
                notebook_id=notebook.id,
                notebook_cell_id=None,
                original_query=query,
                resolved_query=query,
                interpreted_intent=intent,
                semantic_terms_json=[],
                generated_sql=None,
                validation_result_json={"status": "seeded_defense_demo"},
                execution_status="succeeded",
                trace_payload_json={"defense_scenario_id": scenario_id, "seed_only": True},
            )
        )


if __name__ == "__main__":
    main()
