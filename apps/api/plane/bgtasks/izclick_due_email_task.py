"""IZ-Click due reminders and daily summary; no historical backfill."""
import logging
from email.utils import formataddr
from datetime import timedelta
from zoneinfo import ZoneInfo

from celery import shared_task
from django.core.mail import EmailMultiAlternatives, get_connection
from django.template.loader import render_to_string
from django.utils import timezone

from plane.db.models import IssueAssignee, UserNotificationPreference
from plane.license.utils.instance_value import get_email_configuration
from plane.settings.redis import redis_instance
from plane.utils.email import generate_plain_text_from_html

logger = logging.getLogger("plane.worker")
LIMA = ZoneInfo("America/Lima")
BASE_URL = "https://izclick.izango.com.pe"
EXCLUDED = ("completed", "cancelled")


def issue_link(issue):
    return (
        f"{BASE_URL}/{issue.project.workspace.slug}/projects/"
        f"{issue.project_id}/issues/{issue.id}"
    )


def _reminders_allowed(user_id, workspace_id):
    # Reuse Plane's existing general email preference until a dedicated
    # reminder/digest preference control is introduced.
    preference = UserNotificationPreference.objects.filter(
        user_id=user_id, workspace_id=workspace_id, project__isnull=True,
    ).first()
    if preference is None:
        preference = UserNotificationPreference.objects.filter(
            user_id=user_id, workspace__isnull=True, project__isnull=True,
        ).first()
    return preference is None or preference.property_change


def _send(receiver, subject, template, context):
    host, username, password, port, tls, ssl, sender = get_email_configuration()
    if not host or not sender or not receiver.email:
        raise ValueError("IZ-Click: SMTP or recipient missing")
    html = render_to_string(template, context)
    connection = get_connection(
        host=host, port=int(port), username=username, password=password,
        use_tls=str(tls) == "1", use_ssl=str(ssl) == "1",
    )
    message = EmailMultiAlternatives(
        subject=subject,
        body=generate_plain_text_from_html(html),
        from_email=formataddr(("IZ-Click | Izango", sender)),
        to=[receiver.email],
        connection=connection,
    )
    message.attach_alternative(html, "text/html")
    if message.send() != 1:
        raise RuntimeError("SMTP did not accept the message")


def _send_once(key, receiver, subject, template, context):
    """Redis lock and sent marker prevent duplicate mail during schedule retries.

    Failed SMTP releases lock; successful SMTP retains marker for 32 days.
    A crash after SMTP accept but before return can still cause a retry after
    lock expiry; exactly-once SMTP delivery cannot be guaranteed by Redis.
    """
    redis = redis_instance()
    lock_key = f"izclick:mail:{key}"
    if not redis.set(lock_key, "processing", nx=True, ex=300):
        return False
    try:
        _send(receiver, subject, template, context)
        redis.set(lock_key, "sent", ex=60 * 60 * 24 * 32)
        return True
    except Exception:
        redis.delete(lock_key)
        raise


@shared_task
def send_izclick_due_notifications():
    now = timezone.localtime(timezone.now(), LIMA)
    # A single Lima local calendar day for date-only target dates.
    today = now.date()
    tasks = (
        IssueAssignee.objects.select_related(
            "issue", "issue__state", "issue__project",
            "issue__project__workspace", "assignee"
        ).filter(issue__target_date__lt=today, assignee__is_active=True)
        .exclude(issue__state__group__in=EXCLUDED)
        .filter(issue__archived_at__isnull=True, issue__deleted_at__isnull=True, deleted_at__isnull=True
    )
    sent = 0
    for assignment in tasks.iterator(chunk_size=200):
        issue = assignment.issue
        receiver = assignment.assignee
        if not _reminders_allowed(receiver.id, issue.project.workspace_id):
            continue
        key = f"overdue:{issue.id}:{receiver.id}:{issue.target_date.isoformat()}"
        ctx = {
            "project_name": issue.project.name, "list_name": "Pendientes",
            "title": issue.name,
            "message": "Este pendiente ya venció y continúa abierto.",
            "due_date": issue.target_date.strftime("%d/%m/%Y"),
            "task_url": issue_link(issue),
            "preferences_url": f"{BASE_URL}/{issue.project.workspace.slug}/settings/account/notifications/",
        }
        try:
            sent += bool(_send_once(
                key, receiver, f"[IZ-Click] Pendiente vencido: {issue.name}",
                "emails/notifications/izclick-event.html", ctx
            ))
        except Exception:
            logger.exception("Failed overdue reminder issue=%s user=%s", issue.id, receiver.id)
    return sent


@shared_task
def send_izclick_daily_digest():
    now = timezone.localtime(timezone.now(), LIMA)
    today = now.date()
    tomorrow = today + timedelta(days=1)
    if today.weekday() > 4:
        return 0
    assignments = (
        IssueAssignee.objects.select_related(
            "issue", "issue__state", "issue__project",
            "issue__project__workspace", "assignee"
        ).filter(assignee__is_active=True, issue__target_date__isnull=False)
        .exclude(issue__state__group__in=EXCLUDED)
        .filter(issue__archived_at__isnull=True, issue__deleted_at__isnull=True)
        .order_by("assignee_id", "issue__target_date")
    )
    grouped = {}
    for assignment in assignments.iterator(chunk_size=200):
        issue = assignment.issue
        if not assignment.assignee.email or not _reminders_allowed(assignment.assignee_id, issue.project.workspace_id):
            continue
        group = grouped.setdefault(assignment.assignee_id, {
            "receiver": assignment.assignee, "today": [], "tomorrow": [], "overdue": [],
        })
        item = {"name": issue.name, "project": issue.project.name,
                "date": issue.target_date.strftime("%d/%m/%Y"),
                "url": issue_link(issue), "status": issue.state.name}
        if issue.target_date < today:
            group["overdue"].append(item)
        elif issue.target_date == today:
            group["today"].append(item)
        elif issue.target_date == tomorrow:
            group["tomorrow"].append(item)

    sent = 0
    for user_id, group in grouped.items():
        if not any(group[label] for label in ("today", "tomorrow", "overdue")):
            continue
        receiver = group["receiver"]
        context = dict(group)
        context["report_date"] = today.strftime("%d/%m/%Y")
        context["preferences_url"] = f"{BASE_URL}/settings/account/notifications/"
        try:
            sent += bool(_send_once(
                f"digest:{user_id}:{today.isoformat()}", receiver,
                f"[IZ-Click] Resumen de pendientes — {context['report_date']}",
                "emails/notifications/izclick-digest.html", context
            ))
        except Exception:
            logger.exception("Failed daily digest for user=%s", user_id)
    return sent
