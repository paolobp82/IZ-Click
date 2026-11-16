# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Persist IZ-Click in-app notifications using Plane's existing Notification model.

Call from a committed business-event handler, never from a model's save() signal.
The event ID is stable across retries. The same transaction persists each
notification and its durable email outbox entry; SMTP runs after commit.
"""

from uuid import UUID
from urllib.parse import urlsplit

from django.db import transaction

from plane.db.models import Notification, IzclickEmailDelivery, WorkspaceMember


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
    if not project_url or not project_url.startswith("/") or project_url.startswith("//"):
        raise ValueError("project_url must be a relative in-app URL")
    if not event_name.startswith("izclick."):
        raise ValueError("IZ-Click event names must use the izclick. prefix")

    receiver_ids = list(
        dict.fromkeys(
            str(recipient) for recipient in recipients if recipient is not None and str(recipient) != str(actor.pk)
        )
    )
    receiver_ids = list(
        WorkspaceMember.objects.filter(
            workspace_id=project.workspace_id,
            member_id__in=receiver_ids,
            is_active=True,
            member__is_active=True,
            deleted_at__isnull=True,
        )
        .values_list("member_id", flat=True)
        .distinct()
    )
    with transaction.atomic():
        # Lock project to serialize concurrent event deliveries, not just
        # individual recipient rows which may not exist yet.
        type(project).objects.select_for_update().get(pk=project.pk)
        created = []
        for receiver_id in receiver_ids:
            exists = Notification.all_objects.filter(
                workspace_id=project.workspace_id,
                project_id=project.pk,
                entity_identifier=event_id,
                entity_name=event_name,
                receiver_id=receiver_id,
            ).exists()
            if exists:
                continue
            quotation_url = ""
            if event_name in ("izclick.quotation_link_created", "izclick.quotation_link_updated"):
                if urlsplit(message).scheme in ("http", "https") and urlsplit(message).netloc:
                    quotation_url = message
            notification = Notification.objects.create(
                workspace_id=project.workspace_id,
                project_id=project.pk,
                entity_identifier=event_id,
                entity_name=event_name,
                title=title,
                message={"text": message},
                message_html="<p></p>",
                message_stripped=message,
                data={"url": project_url, "event_id": str(event_id), "quotation_url": quotation_url},
                sender="izclick",
                triggered_by=actor,
                receiver_id=receiver_id,
            )
            IzclickEmailDelivery.objects.create(notification=notification)
            created.append(notification)
        if created:

            def enqueue():
                from plane.bgtasks.izclick_coordination_email import drain_coordination_outbox

                drain_coordination_outbox.delay()

            transaction.on_commit(enqueue, robust=True)
        return created
