from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from sqlalchemy import select

from app.core.security import hash_password
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

DEFAULT_ROLES = [
    ("admin", "Administrator"),
    ("manager", "Manager"),
    ("marketer", "Marketer"),
    ("executive", "Executive"),
]


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
            password_hash=hash_password("admin123"),
            is_active=True,
            is_demo_user=True,
            role_id=admin_role.id,
        )
        session.add(user)
        session.flush()
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
        ("done_rides", "Завершенные поездки", "COUNT(CASE WHEN a.driverdone_timestamp IS NOT NULL THEN 1 END)", ["завершенные поездки", "done rides"]),
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


def ensure_query_templates(session, workspace: Workspace, users: dict[str, User], roles: dict[str, Role]) -> None:
    templates = [
        (
            "weekly_cancellations_by_city",
            "Отмены по городам за неделю",
            "Покажи количество отмен по city_id за прошлую неделю",
            "bar",
            "SELECT city_id, COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL)::bigint AS cancellations FROM public.anonymized_incity_orders WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '7 day') GROUP BY 1 ORDER BY 2 DESC",
        ),
        (
            "daily_done_rides",
            "Завершенные поездки по дням",
            "Сравни количество завершенных поездок по дням за 14 дней",
            "line",
            "SELECT date_trunc('day', order_timestamp)::date AS day, COUNT(*) FILTER (WHERE driverdone_timestamp IS NOT NULL)::bigint AS done_rides FROM public.anonymized_incity_orders WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '14 day') GROUP BY 1 ORDER BY 1",
        ),
        (
            "avg_price_by_city",
            "Средняя стоимость заказа по city_id",
            "Покажи среднюю стоимость заказа по городам",
            "bar",
            "SELECT city_id, AVG(price_order_local)::numeric(18,2) AS avg_order_price FROM public.anonymized_incity_orders GROUP BY 1 ORDER BY 2 DESC",
        ),
        (
            "daily_orders_trend",
            "Динамика заказов по дням",
            "Покажи динамику заказов за последние 7 дней",
            "line",
            "SELECT date_trunc('day', order_timestamp)::date AS day, COUNT(DISTINCT order_id)::bigint AS orders_count FROM public.anonymized_incity_orders WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '7 day') GROUP BY 1 ORDER BY 1",
        ),
        (
            "cancel_rate_by_city",
            "Отмены по городам",
            "Покажи cancellation rate по городам за 14 дней",
            "bar",
            "SELECT city_id, (COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL))::numeric / NULLIF(COUNT(DISTINCT order_id),0) AS cancellation_rate FROM public.anonymized_incity_orders WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '14 day') GROUP BY 1 ORDER BY 2 DESC",
        ),
        (
            "retention_proxy_daily",
            "Retention proxy по дням",
            "Покажи ежедневную долю завершенных заказов",
            "line",
            "SELECT date_trunc('day', order_timestamp)::date AS day, (COUNT(*) FILTER (WHERE driverdone_timestamp IS NOT NULL))::numeric / NULLIF(COUNT(DISTINCT order_id),0) AS done_share FROM public.anonymized_incity_orders GROUP BY 1 ORDER BY 1",
        ),
    ]
    for template_key, template_name, nl_template, chart, sql_template in templates:
        tpl = session.scalar(
            select(QueryTemplate).where(
                QueryTemplate.workspace_id == workspace.id,
                QueryTemplate.template_key == template_key,
            )
        )
        if tpl is None:
            session.add(
                QueryTemplate(
                    workspace_id=workspace.id,
                    target_role_id=roles["manager"].id,
                    template_key=template_key,
                    template_name=template_name,
                    nl_prompt_template=nl_template,
                    sql_template=sql_template,
                    default_chart_type=chart,
                    created_by=users["admin"].id,
                )
            )


def ensure_business_demo_data(session, workspace: Workspace) -> None:
    _ = (session, workspace)


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
            generated_sql="SELECT city_id, COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL) AS cancellations FROM public.anonymized_incity_orders WHERE order_timestamp >= CURRENT_DATE - INTERVAL '7 day' GROUP BY city_id;",
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
                generated_sql="SELECT city_id, COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL) AS cancellations FROM public.anonymized_incity_orders GROUP BY city_id;",
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
                report_payload_json={"chart_type": "bar", "sql": "SELECT city_id, COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL) AS cancellations FROM public.anonymized_incity_orders GROUP BY city_id;"},
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
        session.commit()
    print("Demo seed completed (idempotent, platform-wide).")


if __name__ == "__main__":
    main()
