"""Persist IZ-Click in-app notifications using Plane's existing Notification model.

Call from a committed business-event handler, never from a model's save() signal.
The event ID must be stable across retries. Email delivery is intentionally NOT
implemented here; the mail worker must have its own idempotent delivery record.
"""
from uuid import UUID

from django.db import transaction

from plane.db.models import Notification


def publish_project_notifications(
    *,
    project,
    event_id,
    event_name,
    actor,
    recipients,
    title,
    message,
    project_url,
):
    """Create one notification per recipient and event, safe under concurrent retries.

    Serializes writes on the project row. Every caller must use this function
    for IZ-Click project events to retain the idempotency guarantee.
    """
    event_id = UUID(str(event_id))
    if not project_url or not project_url.startswith("/"):
        raise ValueError("project_url must be a relative in-app URL")
    if not event_name.startswith("izclick."):
        raise ValueError("IZ-Click event names must use the izclick. prefix")

    receiver_ids = list(dict.fromkeys(
        str(recipient) for recipient in recipients
        if recipient is not None and str(recipient) != str(actor.pk)
    ))
    with transaction.atomic():
        # Lock project to serialize concurrent event deliveries, not just
        # individual recipient rows which may not exist yet.
        type(project).objects.select_for_update().get(pk=project.pk)
        created = []
        for receiver_id in receiver_ids:
            exists = Notification.objects.filter(
                workspace_id=project.workspace_id,
                project_id=project.pk,
                entity_identifier=event_id,
                entity_name=event_name,
                receiver_id=receiver_id,
            ).exists()
            if exists:
                continue
            created.append(Notification.objects.create(
                workspace_id=project.workspace_id,
                project_id=project.pk,
                entity_identifier=event_id,
                entity_name=event_name,
                title=title,
                message={"text": message},
                message_html="<p></p>",
                message_stripped=message,
                data={"url": project_url, "event_id": str(event_id)},
                sender="izclick",
                triggered_by=actor,
                receiver_id=receiver_id,
            ))
        return created
