# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Explicit lifecycle adapters. Persist notification and mail outbox with the change."""

from uuid import uuid4

from plane.utils.izclick_access import coordination_enabled

from plane.db.models import IzclickProjectCoordination, IzclickWorkspaceRole, ProjectMember
from plane.utils.izclick_events import dispatch_project_event


def emit(project, actor, event, *, event_id=None, message=None, url=None):
    if not coordination_enabled(project.workspace.slug) or actor is None:
        return
    row = IzclickProjectCoordination.objects.filter(project=project).first()
    if row is None:
        return
    coordinators = list(
        IzclickWorkspaceRole.objects.filter(
            workspace_id=project.workspace_id,
            role="coordinator",
            user__is_active=True,
            user__member_workspace__workspace_id=project.workspace_id,
            user__member_workspace__is_active=True,
            user__member_workspace__deleted_at__isnull=True,
        )
        .values_list("user_id", flat=True)
        .distinct()
    )
    participants = list(
        ProjectMember.objects.filter(
            project=project,
            is_active=True,
            member__is_active=True,
        ).values_list("member_id", flat=True)
    )
    dispatch_project_event(
        project=project,
        actor=actor,
        event_id=event_id or uuid4(),
        event=event,
        project_url=url or f"/{project.workspace.slug}/coordination/?project={project.pk}",
        coordinator_ids=coordinators,
        producer_id=row.producer_id,
        commercial_id=row.commercial_id,
        participant_ids=[*participants, *coordinators, row.commercial_id, row.producer_id],
        message=message,
    )


def project_created(project, actor, intake=None):
    if not coordination_enabled(project.workspace.slug):
        return
    role = (
        IzclickWorkspaceRole.objects.filter(
            workspace_id=project.workspace_id,
            user=actor,
        )
        .values_list("role", flat=True)
        .first()
    )
    from plane.api.views.izclick_coordination import CoordinationMetadataSerializer

    metadata = CoordinationMetadataSerializer(
        data={
            **{k: v for k, v in (intake or {}).items() if k in ("client", "start_date", "due_date", "quotation_url")},
            "version": 0,
        }
    )
    metadata.is_valid(raise_exception=True)
    values = metadata.validated_data
    values.pop("version")
    if values.get("start_date") and values.get("due_date") and values["start_date"] > values["due_date"]:
        from rest_framework.exceptions import ValidationError

        raise ValidationError("Start date must precede delivery date")
    row, created = IzclickProjectCoordination.objects.get_or_create(
        project=project,
        defaults={
            "workspace_id": project.workspace_id,
            "commercial": actor if role == "commercial" else None,
            **values,
        },
    )
    if created:
        emit(project, actor, "project_created", event_id=project.pk)
