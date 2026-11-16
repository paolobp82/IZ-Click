"""Retryable durable SMTP outbox for coordination events."""

from datetime import timedelta
from email.utils import formataddr
from urllib.parse import urlsplit

from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.db import transaction
from django.db.models import Q
from django.template.loader import render_to_string
from django.utils import timezone

from plane.db.models import IzclickEmailDelivery, WorkspaceMember
from plane.license.utils.instance_value import get_email_configuration
from plane.utils.email import generate_plain_text_from_html


def send_delivery(delivery):
    notification = delivery.notification
    receiver = notification.receiver
    if (
        not receiver.is_active
        or not WorkspaceMember.objects.filter(
            workspace_id=notification.workspace_id,
            member=receiver,
            is_active=True,
        ).exists()
    ):
        raise ValueError("Recipient is no longer an active workspace member")
    base = (settings.WEB_URL or "").rstrip("/")
    if urlsplit(base).scheme not in ("http", "https") or not urlsplit(base).netloc:
        raise ValueError("WEB_URL must be configured")
    path = notification.data["url"]
    if not path.startswith("/") or path.startswith("//"):
        raise ValueError("Invalid project link")
    host, username, password, port, tls, ssl, sender = get_email_configuration()
    if not host or not sender:
        raise ValueError("SMTP is not configured")
    html = render_to_string(
        "emails/notifications/izclick-event.html",
        {
            "project_name": notification.project.name,
            "title": notification.title,
            "message": notification.message_stripped,
            "task_url": base + path,
            "preferences_url": base + f"/{notification.project.workspace.slug}/notifications/",
            "preferences_label": "Ver notificaciones",
            "button_label": "Ver proyecto",
            "quotation_url": notification.data.get("quotation_url", ""),
        },
    )
    connection = get_connection(
        host=host,
        port=int(port),
        username=username,
        password=password,
        use_tls=str(tls) == "1",
        use_ssl=str(ssl) == "1",
        timeout=30,
    )
    mail = EmailMultiAlternatives(
        subject=notification.title,
        body=generate_plain_text_from_html(html),
        from_email=formataddr(("IZ-Click | Izango", sender)),
        to=[receiver.email],
        connection=connection,
        headers={"Message-ID": f"<izclick-{delivery.pk}@{urlsplit(base).hostname}>"},
    )
    mail.attach_alternative(html, "text/html")
    if mail.send() != 1:
        raise RuntimeError("SMTP did not accept the message")


@shared_task
def drain_coordination_outbox():
    if not getattr(settings, "IZCLICK_COORDINATION_ENABLED", False):
        return 0
    sent = 0
    # Lock each delivery for the entire send to serialize competing workers.
    for _ in range(100):
        with transaction.atomic():
            delivery = (
                IzclickEmailDelivery.objects.select_for_update(skip_locked=True, of=("self",))
                .filter(
                    sent_at__isnull=True,
                )
                .filter(Q(next_attempt_at__isnull=True) | Q(next_attempt_at__lte=timezone.now()))
                .select_related(
                    "notification__receiver",
                    "notification__project",
                )
                .order_by("created_at")
                .first()
            )
            if delivery is None:
                break
            delivery.attempts += 1
            try:
                send_delivery(delivery)
            except Exception as exc:
                # Keep credential/server details out of persisted user data.
                delivery.last_error = type(exc).__name__
                delivery.next_attempt_at = timezone.now() + timedelta(
                    seconds=min(3600, 30 * 2 ** min(delivery.attempts, 7))
                )
            else:
                delivery.sent_at = timezone.now()
                delivery.last_error = ""
                delivery.next_attempt_at = None
                sent += 1
            delivery.save(update_fields=["attempts", "sent_at", "last_error", "next_attempt_at", "updated_at"])
    return sent
