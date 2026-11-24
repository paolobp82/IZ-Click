# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Authenticated IZ-Click coordination API.

This API is additive and does not alter existing Plane project endpoints.
"""

import uuid
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status, serializers
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError, NotFound

from plane.app.views.base import BaseAPIView as SessionBaseAPIView
from plane.db.models import (
    IzclickProjectCoordination,
    IzclickWorkspaceRole,
    Project,
    User,
    WorkspaceMember,
)
from plane.utils.izclick_assignment import assign_producer
from plane.utils.izclick_access import coordination_enabled, is_business_superadmin
from plane.authentication.session import BaseSessionAuthentication
from plane.api.middleware.api_authentication import APIKeyAuthentication


class BaseAPIView(SessionBaseAPIView):
    authentication_classes = [BaseSessionAuthentication, APIKeyAuthentication]


class CoordinationMetadataSerializer(serializers.Serializer):
    client = serializers.CharField(max_length=255, required=False, allow_blank=True)
    start_date = serializers.DateField(required=False, allow_null=True)
    due_date = serializers.DateField(required=False, allow_null=True)
    workflow_status = serializers.ChoiceField(choices=["active", "completed", "cancelled"], required=False)
    quotation_url = serializers.URLField(max_length=2048, required=False, allow_blank=True)
    version = serializers.IntegerField(min_value=0)


class IzclickAccessAPI(BaseAPIView):
    def get(self, request, slug):
        from plane.db.models import Workspace
        from plane.utils.izclick_access import business_role

        workspace = get_object_or_404(Workspace, slug=slug)
        _require_coordination_access(request, workspace, read=True)
        return Response(
            {"enabled": True, "role": business_role(request.user, slug), "current_user_id": str(request.user.pk)}
        )


def _workspace_member(request, workspace):
    if not request.user.is_active:
        raise PermissionDenied("Active user required")
    if not WorkspaceMember.objects.filter(
        workspace=workspace,
        member=request.user,
        is_active=True,
        deleted_at__isnull=True,
    ).exists():
        raise PermissionDenied("Workspace membership required")


def _require_coordination_access(request, workspace, *, read=False):
    # Fail closed until the new tables and roles are deployed and verified.
    if not coordination_enabled(workspace.slug):
        raise NotFound("IZ-Click coordination is not enabled")
    _workspace_member(request, workspace)
    if read:
        return
    if is_business_superadmin(request.user):
        return
    if not IzclickWorkspaceRole.objects.filter(
        workspace=workspace,
        user=request.user,
        role=IzclickWorkspaceRole.Role.COORDINATOR,
        deleted_at__isnull=True,
    ).exists():
        raise PermissionDenied("Coordinator role required")


def _coordination_payload(row):
    return {
        "project_id": str(row.project_id),
        "project_name": row.project.name,
        "project_identifier": row.project.identifier,
        "commercial_id": str(row.commercial_id) if row.commercial_id else None,
        "assigned_by_id": str(row.assigned_by_id) if row.assigned_by_id else None,
        "producer_id": str(row.producer_id) if row.producer_id else None,
        "status": row.status,
        "client": row.client,
        "start_date": row.start_date,
        "due_date": row.due_date,
        "workflow_status": row.workflow_status,
        "quotation_url": row.quotation_url,
        "version": row.version,
        "updated_at": row.updated_at.isoformat(),
    }


class IzclickCoordinationQueueAPI(BaseAPIView):
    """Shared coordination inbox, readable by active workspace members."""

    def get(self, request, slug):
        from plane.db.models import Workspace

        workspace = get_object_or_404(Workspace, slug=slug)
        _require_coordination_access(request, workspace)
        # Existing projects without a coordination row are not automatically
        # treated as pending: doing so would misclassify historical projects.
        rows = (
            IzclickProjectCoordination.objects.filter(
                workspace=workspace,
                status=IzclickProjectCoordination.Status.PENDING,
                workflow_status="active",
                project__archived_at__isnull=True,
                project__deleted_at__isnull=True,
                deleted_at__isnull=True,
            )
            .select_related("project")
            .order_by("created_at")
        )
        return Response([_coordination_payload(row) for row in rows])


class IzclickProjectAssignmentAPI(BaseAPIView):
    """Coordinator-only producer assignment with optimistic concurrency."""

    def post(self, request, slug, project_id):
        from plane.db.models import Workspace

        workspace = get_object_or_404(Workspace, slug=slug)
        _require_coordination_access(request, workspace)
        project = get_object_or_404(Project, pk=project_id, workspace=workspace, deleted_at__isnull=True)
        if not isinstance(request.data, dict):
            raise ValidationError("Expected a JSON object")
        producer_id = request.data.get("producer_id")
        if not producer_id:
            raise ValidationError({"producer_id": "Required"})
        if "expected_producer_id" not in request.data:
            raise ValidationError({"expected_producer_id": "Required, null if unassigned"})
        version = request.data.get("expected_version")
        if type(version) is not int or version < 0:
            raise ValidationError({"expected_version": "Required nonnegative integer"})
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
            expected_version=version,
        )
        return Response(
            {
                "coordination": _coordination_payload(
                    IzclickProjectCoordination.objects.select_related("project").get(pk=row.pk)
                ),
                "changed": changed,
            },
            status=status.HTTP_200_OK,
        )


class IzclickProducerWorkloadAPI(BaseAPIView):
    """Workspace-scoped workload based on explicit IZ-Click assignments."""

    def get(self, request, slug):
        from plane.db.models import Workspace

        workspace = get_object_or_404(Workspace, slug=slug)
        _require_coordination_access(request, workspace, read=True)
        producer_ids = list(
            IzclickWorkspaceRole.objects.filter(
                workspace=workspace,
                role=IzclickWorkspaceRole.Role.PRODUCER,
                deleted_at__isnull=True,
                user__is_active=True,
                user__member_workspace__is_active=True,
                user__member_workspace__workspace=workspace,
                user__member_workspace__deleted_at__isnull=True,
            )
            .values_list("user_id", flat=True)
            .distinct()
        )
        rows = IzclickProjectCoordination.objects.filter(
            workspace=workspace,
            producer_id__in=producer_ids,
            status=IzclickProjectCoordination.Status.ASSIGNED,
            deleted_at__isnull=True,
            project__deleted_at__isnull=True,
            project__archived_at__isnull=True,
            workflow_status="active",
        ).select_related("project", "producer")
        producer_users = User.objects.filter(pk__in=producer_ids)
        grouped = {
            str(user.pk): {
                "producer_id": str(user.pk),
                "producer_name": user.display_name or user.email,
                "active_count": 0,
                "projects": [],
            }
            for user in producer_users
        }
        for row in rows:
            entry = grouped[str(row.producer_id)]
            entry["active_count"] += 1
            payload = _coordination_payload(row)
            from django.utils import timezone
            from datetime import timedelta

            today = timezone.localdate()
            payload["overdue"] = bool(row.due_date and row.due_date < today)
            payload["due_soon"] = bool(row.due_date and today <= row.due_date <= today + timedelta(days=7))
            entry["projects"].append(payload)
        for entry in grouped.values():
            entry["overdue_count"] = sum(p["overdue"] for p in entry["projects"])
            entry["due_soon_count"] = sum(p["due_soon"] for p in entry["projects"])
        return Response(list(grouped.values()))


class IzclickWorkspaceRolesAPI(BaseAPIView):
    """List and update business roles without modifying Plane memberships."""

    def get(self, request, slug):
        from plane.db.models import Workspace

        workspace = get_object_or_404(Workspace, slug=slug)
        _require_coordination_access(request, workspace, read=True)
        roles = dict(IzclickWorkspaceRole.objects.filter(workspace=workspace).values_list("user_id", "role"))
        members = (
            WorkspaceMember.objects.filter(
                workspace=workspace, is_active=True, member__is_active=True, member__is_bot=False
            )
            .select_related("member")
            .order_by("member__email")
        )
        return Response(
            [
                {
                    "user_id": str(m.member_id),
                    "email": m.member.email,
                    "name": m.member.display_name or m.member.email,
                    "role": roles.get(m.member_id),
                }
                for m in members
            ]
        )

    @transaction.atomic
    def patch(self, request, slug):
        from plane.db.models import Workspace

        workspace = get_object_or_404(Workspace, slug=slug)
        _require_coordination_access(request, workspace)
        if not is_business_superadmin(request.user):
            raise PermissionDenied("Only superadmins may change business roles")
        if not isinstance(request.data, dict):
            raise ValidationError("Expected a JSON object")
        role = request.data.get("role")
        if role not in IzclickWorkspaceRole.Role.values:
            raise ValidationError({"role": "Invalid business role"})
        try:
            user_id = uuid.UUID(str(request.data.get("user_id")))
        except (TypeError, ValueError, AttributeError):
            raise ValidationError({"user_id": "Must be a valid UUID"})
        member = get_object_or_404(
            WorkspaceMember,
            workspace=workspace,
            member_id=user_id,
            is_active=True,
            deleted_at__isnull=True,
            member__is_active=True,
            member__is_bot=False,
        )
        from plane.utils.izclick_roles import set_business_role

        row = set_business_role(workspace=workspace, user=member.member, role=role, actor=request.user)
        return Response({"user_id": str(row.user_id), "role": row.role})


class IzclickProjectsAPI(BaseAPIView):
    def get(self, request, slug):
        from plane.db.models import Workspace

        workspace = get_object_or_404(Workspace, slug=slug)
        _require_coordination_access(request, workspace, read=True)
        rows = (
            IzclickProjectCoordination.objects.filter(
                workspace=workspace,
                project__deleted_at__isnull=True,
            )
            .select_related("project")
            .order_by("-created_at")
        )
        from plane.utils.izclick_access import business_role

        return Response(
            {
                "role": business_role(request.user, slug),
                "current_user_id": str(request.user.pk),
                "projects": [_coordination_payload(row) for row in rows],
            }
        )


class IzclickProjectMetadataAPI(BaseAPIView):
    @transaction.atomic
    def patch(self, request, slug, project_id):
        from plane.db.models import Workspace
        from plane.utils.izclick_access import can_write
        from plane.utils.izclick_lifecycle import emit

        workspace = get_object_or_404(Workspace, slug=slug)
        _require_coordination_access(request, workspace, read=True)
        if not can_write(request.user, slug, project_id):
            raise PermissionDenied("Only coordinator or assigned producer may edit")
        get_object_or_404(Project.objects.select_for_update(), pk=project_id, workspace=workspace)
        row = get_object_or_404(
            IzclickProjectCoordination.objects.select_for_update(),
            workspace=workspace,
            project_id=project_id,
            project__deleted_at__isnull=True,
        )
        serializer = CoordinationMetadataSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        if row.version != values.pop("version"):
            return Response({"error": "Project changed; reload before saving"}, status=409)
        start = values.get("start_date", row.start_date)
        due = values.get("due_date", row.due_date)
        if start and due and start > due:
            raise ValidationError("Start date must precede delivery date")
        events = []
        if "workflow_status" in values and values["workflow_status"] != row.workflow_status:
            events.append(("status_changed", f"{row.workflow_status} → {values['workflow_status']}"))
        if "quotation_url" in values and values["quotation_url"] != row.quotation_url:
            event = "quotation_link_updated" if row.quotation_url else "quotation_link_created"
            events.append((event, values["quotation_url"] or "Enlace de cotización retirado"))
        changed = any(getattr(row, key) != value for key, value in values.items())
        for key, value in values.items():
            setattr(row, key, value)
        if changed:
            row.version += 1
            row.save()
            for event, message in events:
                emit(
                    row.project, request.user, event, message=message, url=f"/{slug}/coordination/?project={project_id}"
                )
        return Response(_coordination_payload(row))


class IzclickProjectCommentsAPI(BaseAPIView):
    def _project(self, request, slug, project_id):
        from plane.db.models import Workspace

        workspace = get_object_or_404(Workspace, slug=slug)
        _require_coordination_access(request, workspace, read=True)
        return get_object_or_404(Project, workspace=workspace, pk=project_id)

    def get(self, request, slug, project_id):
        from plane.db.models import IzclickProjectComment, IzclickAssignmentHistory

        project = self._project(request, slug, project_id)
        return Response(
            {
                "comments": list(
                    IzclickProjectComment.objects.filter(project=project).values(
                        "id", "body", "created_by_id", "created_at"
                    )
                ),
                "assignments": list(
                    IzclickAssignmentHistory.objects.filter(coordination__project=project).values(
                        "id", "actor_id", "previous_producer_id", "new_producer_id", "created_at"
                    )
                ),
            }
        )

    @transaction.atomic
    def post(self, request, slug, project_id):
        from plane.db.models import IzclickProjectComment
        from plane.utils.izclick_access import can_write
        from plane.utils.izclick_lifecycle import emit

        project = self._project(request, slug, project_id)
        if not isinstance(request.data, dict):
            raise ValidationError("Expected a JSON object")
        if not can_write(request.user, slug, project_id):
            raise PermissionDenied("Only coordinator or assigned producer may comment")
        body = request.data.get("body")
        if not isinstance(body, str) or not body.strip() or len(body) > 10000:
            raise ValidationError({"body": "Provide 1–10000 characters"})
        comment = IzclickProjectComment(project=project, body=body.strip(), created_by=request.user)
        comment.save(disable_auto_set_user=True)
        emit(
            project,
            request.user,
            "comment_created",
            event_id=comment.pk,
            message=body.strip(),
            url=f"/{slug}/coordination/?project={project_id}",
        )
        return Response({"id": str(comment.pk), "body": comment.body}, status=201)
