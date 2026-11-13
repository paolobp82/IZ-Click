"""Transactional producer assignment for IZ-Click coordination."""
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction

from plane.db.models import (
    IzclickAssignmentHistory,
    IzclickProjectCoordination,
    IzclickWorkspaceRole,
    WorkspaceMember,
)


@transaction.atomic
def assign_producer(*, project, actor, producer, expected_producer_id=None):
    """Assign or reassign with an optimistic concurrency check.

    expected_producer_id=None means the caller expects an unassigned project.
    Caller must pass a workspace-scoped project fetched under normal auth.
    The project lock also serializes the first creation of the coordination row.
    """
    type(project).objects.select_for_update().get(pk=project.pk)
    allowed = (
        actor.is_superuser
        or IzclickWorkspaceRole.objects.filter(
            workspace_id=project.workspace_id,
            user_id=actor.pk,
            role=IzclickWorkspaceRole.Role.COORDINATOR,
            deleted_at__isnull=True,
        ).exists()
    )
    if not allowed:
        raise PermissionDenied("Only coordinators or superadmins may assign producers")
    if not WorkspaceMember.objects.filter(
        workspace_id=project.workspace_id, member_id=producer.pk,
        is_active=True, deleted_at__isnull=True,
    ).exists():
        raise ValidationError("Producer must be an active workspace member")
    if not IzclickWorkspaceRole.objects.filter(
        workspace_id=project.workspace_id,
        user_id=producer.pk,
        role=IzclickWorkspaceRole.Role.PRODUCER,
        deleted_at__isnull=True,
    ).exists():
        raise ValidationError("Selected user is not a producer")
    coordination, _ = IzclickProjectCoordination.objects.get_or_create(
        project=project, defaults={"workspace_id": project.workspace_id}
    )
    old_id = coordination.producer_id
    if str(old_id) if old_id is not None else None != (
        str(expected_producer_id) if expected_producer_id is not None else None
    ):
        raise ValidationError("Assignment changed; reload before assigning")
    if old_id == producer.pk:
        return coordination, False
    IzclickAssignmentHistory.objects.create(
        coordination=coordination,
        actor=actor,
        previous_producer_id=old_id,
        new_producer=producer,
    )
    coordination.producer = producer
    coordination.assigned_by = actor
    coordination.status = IzclickProjectCoordination.Status.ASSIGNED
    coordination.save(update_fields=["producer", "assigned_by", "status", "updated_at"])
    return coordination, True
