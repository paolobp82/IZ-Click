"""Authenticated IZ-Click coordination API.

This API is additive and does not alter existing Plane project endpoints.
"""
import uuid
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError

from plane.api.views.base import BaseAPIView
from plane.db.models import (
    IzclickProjectCoordination,
    Project,
    User,
    WorkspaceMember,
)
from plane.utils.izclick_assignment import assign_producer


def _workspace_member(request, workspace):
    if not WorkspaceMember.objects.filter(
        workspace=workspace, member=request.user, is_active=True,
        deleted_at__isnull=True,
    ).exists():
        raise PermissionDenied("Workspace membership required")


def _coordination_payload(row):
    return {
        "project_id": str(row.project_id),
        "project_name": row.project.name,
        "project_identifier": row.project.identifier,
        "commercial_id": str(row.commercial_id) if row.commercial_id else None,
        "assigned_by_id": str(row.assigned_by_id) if row.assigned_by_id else None,
        "producer_id": str(row.producer_id) if row.producer_id else None,
        "status": row.status,
        "updated_at": row.updated_at.isoformat(),
    }


class IzclickCoordinationQueueAPI(BaseAPIView):
    """Shared coordination inbox, readable by active workspace members."""

    def get(self, request, slug):
        from plane.db.models import Workspace
        workspace = get_object_or_404(Workspace, slug=slug)
        _workspace_member(request, workspace)
        # Existing projects without a coordination row are not automatically
        # treated as pending: doing so would misclassify historical projects.
        rows = IzclickProjectCoordination.objects.filter(
            workspace=workspace, status=IzclickProjectCoordination.Status.PENDING,
            deleted_at__isnull=True,
        ).select_related("project").order_by("created_at")
        return Response([_coordination_payload(row) for row in rows])


class IzclickProjectAssignmentAPI(BaseAPIView):
    """Coordinator-only producer assignment with optimistic concurrency."""

    def post(self, request, slug, project_id):
        from plane.db.models import Workspace
        workspace = get_object_or_404(Workspace, slug=slug)
        _workspace_member(request, workspace)
        project = get_object_or_404(
            Project, pk=project_id, workspace=workspace, deleted_at__isnull=True
        )
        if not isinstance(request.data, dict):
            raise ValidationError("Expected a JSON object")
        producer_id = request.data.get("producer_id")
        if not producer_id:
            raise ValidationError({"producer_id": "Required"})
        if "expected_producer_id" not in request.data:
            raise ValidationError({"expected_producer_id": "Required, null if unassigned"})
        try:
            producer_uuid = uuid.UUID(str(producer_id))
        except (TypeError, ValueError, AttributeError):
            raise ValidationError({"producer_id": "Must be a valid UUID"})
        producer = get_object_or_404(User, pk=producer_uuid)
        row, changed = assign_producer(
            project=project,
            actor=request.user,
            producer=producer,
            expected_producer_id=request.data["expected_producer_id"],
        )
        return Response(
            {"coordination": _coordination_payload(
                IzclickProjectCoordination.objects.select_related("project").get(pk=row.pk)
            ), "changed": changed},
            status=status.HTTP_200_OK,
        )
