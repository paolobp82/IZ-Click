# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Coordination of native work items; no conversion of historical records."""

from uuid import uuid4
from functools import partial
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from plane.db.models import (
    Issue,
    IssueAssignee,
    IssueSubscriber,
    ProjectMember,
    WorkspaceMember,
    IzclickWorkspaceRole,
    IzclickIssueCoordination,
    IzclickIssueAssignmentHistory,
)
from plane.utils.izclick_access import business_role, coordination_enabled
from plane.utils.izclick_notifications import publish_project_notifications


def enqueue_after_commit(task, **kwargs):
    transaction.on_commit(partial(task.delay, **kwargs), robust=True)


def coordinator_ids(workspace_id):
    return list(
        IzclickWorkspaceRole.objects.filter(
            workspace_id=workspace_id,
            role="coordinator",
            user__is_active=True,
            user__member_workspace__workspace_id=workspace_id,
            user__member_workspace__is_active=True,
            user__member_workspace__deleted_at__isnull=True,
        )
        .values_list("user_id", flat=True)
        .distinct()
    )


def managed_issue(issue_id, project_id, slug):
    """Subtasks inherit their nearest managed ancestor's producer."""
    seen = set()
    while issue_id and str(issue_id) not in seen and len(seen) < 50:
        seen.add(str(issue_id))
        issue = (
            Issue.objects.filter(
                pk=issue_id, project_id=project_id, workspace__slug=slug
            )
            .only("id", "parent_id")
            .first()
        )
        if issue is None:
            return None
        row = IzclickIssueCoordination.objects.filter(
            issue=issue, workspace__slug=slug
        ).first()
        if row:
            return row
        issue_id = issue.parent_id
    return None


def enforce_issue_write(request, kwargs):
    slug, project_id = kwargs.get("slug"), kwargs.get("project_id")
    if (
        not slug
        or not project_id
        or not coordination_enabled(slug)
        or request.method in ("GET", "HEAD", "OPTIONS")
    ):
        return False
    path = request.path.rstrip("/")
    if "issues" not in path:
        return False
    data = request.data if isinstance(request.data, dict) else {}
    role = business_role(request.user, slug)
    updates = data.get("updates", [])
    if isinstance(updates, list):
        for update in updates:
            if isinstance(update, dict) and update.get("id"):
                managed = managed_issue(update["id"], project_id, slug)
                if (
                    managed
                    and role not in ("coordinator", "superadmin")
                    and not (
                        role == "producer" and managed.producer_id == request.user.pk
                    )
                ):
                    raise PermissionDenied(
                        "La operación incluye una carga que no tienes asignada"
                    )
    for field in ("issue_ids", "sub_issue_ids"):
        for candidate in (
            data.get(field, []) if isinstance(data.get(field), list) else []
        ):
            managed = managed_issue(candidate, project_id, slug)
            if managed and field == "sub_issue_ids":
                raise PermissionDenied(
                    "No se puede convertir una carga gestionada en una subtarea de otra carga"
                )
            if (
                managed
                and role not in ("coordinator", "superadmin")
                and not (role == "producer" and managed.producer_id == request.user.pk)
            ):
                raise PermissionDenied(
                    "La operación incluye una carga que no tienes asignada"
                )
    issue_id = kwargs.get("issue_id") or kwargs.get("pk")
    creating = request.method == "POST" and path.endswith("/issues")
    if creating:
        parent = data.get("parent_id") or data.get("parent")
        if not parent:
            if role not in ("commercial", "coordinator", "superadmin"):
                raise PermissionDenied(
                    "Solo comercial o coordinación puede enviar una carga nueva"
                )
            if data.get("assignee_ids") or data.get("assignees"):
                raise ValidationError(
                    "Envía la carga a coordinación; el productor se asigna desde la cola compartida"
                )
            return True
        issue_id = parent
    row = managed_issue(issue_id, project_id, slug) if issue_id else None
    if row:
        if role not in ("coordinator", "superadmin") and not (
            role == "producer" and row.producer_id == request.user.pk
        ):
            raise PermissionDenied(
                "Solo coordinación o el productor actual puede modificar esta carga"
            )
        if creating and (data.get("assignee_ids") or data.get("assignees")):
            raise PermissionDenied("Las subtareas heredan el productor de la carga")
        if (
            any(
                key in data
                for key in (
                    "assignee_ids",
                    "assignees",
                    "project_id",
                    "parent_id",
                    "parent",
                )
            )
            and not creating
        ):
            raise PermissionDenied(
                "La asignación y el traslado de una carga gestionada deben realizarse desde coordinación"
            )
        return True
    return False


def subscribe(issue, user_ids):
    for user_id in dict.fromkeys(i for i in user_ids if i):
        if WorkspaceMember.objects.filter(
            workspace_id=issue.workspace_id,
            member_id=user_id,
            is_active=True,
            member__is_active=True,
            deleted_at__isnull=True,
        ).exists():
            IssueSubscriber.objects.get_or_create(
                issue=issue,
                subscriber_id=user_id,
                defaults={
                    "project_id": issue.project_id,
                    "workspace_id": issue.workspace_id,
                },
            )


def notify(row, actor, event, recipients, message):
    issue = row.issue
    return publish_project_notifications(
        project=issue.project,
        actor=actor,
        event_id=uuid4(),
        event_name="izclick.issue_" + event,
        recipients=recipients,
        title=issue.name,
        message=message,
        project_url=f"/{issue.workspace.slug}/coordination/?task={issue.pk}",
    )


@transaction.atomic
def issue_created(issue, actor):
    if (
        not coordination_enabled(issue.workspace.slug)
        or issue.parent_id
        or issue.is_draft
    ):
        return None
    if business_role(actor, issue.workspace.slug) not in (
        "commercial",
        "coordinator",
        "superadmin",
    ):
        raise PermissionDenied("Solo comercial o coordinación puede enviar cargas")
    if issue.state and issue.state.group in ("completed", "cancelled"):
        raise ValidationError("Una carga nueva debe enviarse en un estado activo")
    row, created = IzclickIssueCoordination.objects.get_or_create(
        issue=issue, defaults={"workspace_id": issue.workspace_id, "commercial": actor}
    )
    if not created:
        return row
    # Keep native assignment rows as history; a new request enters unassigned.
    IssueAssignee.objects.filter(issue=issue).update(deleted_at=timezone.now())
    from plane.db.models import IzclickCustomField, IzclickCustomFieldValue

    field, _ = IzclickCustomField.objects.get_or_create(
        project=issue.project,
        name="Comercial asignado",
        defaults={"field_type": "member", "created_by": actor},
    )
    if field.field_type == "member":
        value = IzclickCustomFieldValue(
            field=field, issue=issue, value=str(actor.pk), created_by=actor
        )
        value.save(disable_auto_set_user=True)
    coordinators = coordinator_ids(issue.workspace_id)
    subscribe(issue, [actor.pk, *coordinators])
    notify(
        row,
        actor,
        "created",
        coordinators,
        "Nueva carga enviada a la cola compartida de coordinación",
    )
    return row


@transaction.atomic
def assign_issue(
    *, issue_id, slug, actor, producer_id, expected_version, expected_producer_id
):
    issue = (
        Issue.objects.select_for_update()
        .select_related("workspace", "project")
        .get(pk=issue_id, workspace__slug=slug)
    )
    if business_role(actor, slug) not in ("coordinator", "superadmin"):
        raise PermissionDenied("Solo coordinación puede asignar productores")
    row = IzclickIssueCoordination.objects.select_for_update().get(issue=issue)
    if issue.archived_at or (
        issue.state and issue.state.group in ("completed", "cancelled")
    ):
        raise ValidationError("No se puede asignar una carga cerrada o archivada")
    if (
        row.version != expected_version
        or (str(row.producer_id) if row.producer_id else None) != expected_producer_id
    ):
        raise ValidationError(
            "La asignación cambió; actualiza la cola antes de asignar"
        )
    if not IzclickWorkspaceRole.objects.filter(
        workspace_id=issue.workspace_id,
        user_id=producer_id,
        role="producer",
        user__is_active=True,
        user__is_bot=False,
        user__member_workspace__workspace_id=issue.workspace_id,
        user__member_workspace__is_active=True,
        user__member_workspace__deleted_at__isnull=True,
    ).exists():
        raise ValidationError("Selecciona un productor activo de este espacio")
    if str(row.producer_id) == str(producer_id):
        return row, False
    old_id = row.producer_id
    member, _ = ProjectMember.objects.get_or_create(
        project=issue.project,
        member_id=producer_id,
        defaults={"role": 15, "is_active": True, "workspace_id": issue.workspace_id},
    )
    if not member.is_active:
        member.is_active = True
        member.save(update_fields=["is_active"])
    IssueAssignee.objects.filter(issue=issue).update(deleted_at=timezone.now())
    IssueAssignee.objects.create(
        issue=issue,
        assignee_id=producer_id,
        project_id=issue.project_id,
        workspace_id=issue.workspace_id,
    )
    history = IzclickIssueAssignmentHistory(
        coordination=row,
        actor=actor,
        previous_producer_id=old_id,
        new_producer_id=producer_id,
    )
    history.save(disable_auto_set_user=True)
    row.producer_id, row.assigned_by, row.status = producer_id, actor, "assigned"
    row.version += 1
    row.save(disable_auto_set_user=True)
    subscribe(
        issue, [producer_id, row.commercial_id, *coordinator_ids(issue.workspace_id)]
    )
    notify(
        row,
        actor,
        "reassigned" if old_id else "assigned",
        [old_id, producer_id, row.commercial_id],
        "Carga reasignada a otro productor"
        if old_id
        else "Productor asignado a la carga",
    )
    return row, True
