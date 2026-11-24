# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import timedelta
from uuid import UUID
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from plane.api.views.izclick_coordination import (
    BaseAPIView,
    _require_coordination_access,
)
from plane.db.models import (
    Workspace,
    Issue,
    IssueAssignee,
    IzclickIssueCoordination,
    IzclickWorkspaceRole,
)
from plane.utils.izclick_access import business_role
from plane.utils.izclick_issue_intake import assign_issue


def scope(request, slug):
    workspace = get_object_or_404(Workspace, slug=slug)
    _require_coordination_access(request, workspace, read=True)
    if not business_role(request.user, slug):
        raise PermissionDenied("Se requiere un rol de agencia")
    return workspace


def payload(issue, row=None):
    return {
        "id": str(issue.pk),
        "project_id": str(issue.project_id),
        "name": issue.name,
        "identifier": f"{issue.project.identifier}-{issue.sequence_id}",
        "project_name": issue.project.name,
        "state": issue.state.name if issue.state else "",
        "closed": bool(issue.state and issue.state.group in ("completed", "cancelled")),
        "clients": [
            label.name.removeprefix("Cliente:").strip()
            for label in issue.labels.all()
            if label.name.startswith("Cliente:")
        ],
        "start_date": issue.start_date,
        "due_date": issue.target_date,
        "commercial_id": str(row.commercial_id) if row and row.commercial_id else None,
        "producer_id": str(row.producer_id) if row and row.producer_id else None,
        "status": row.status if row else "assigned",
        "version": row.version if row else None,
        "url": f"/{issue.workspace.slug}/browse/{issue.project.identifier}-{issue.sequence_id}",
    }


class IzclickIssueCoordinationAPI(BaseAPIView):
    def get(self, request, slug):
        workspace = scope(request, slug)
        rows = (
            IzclickIssueCoordination.objects.filter(
                workspace=workspace,
                issue__deleted_at__isnull=True,
                issue__archived_at__isnull=True,
            )
            .select_related("issue__project", "issue__state", "issue__workspace")
            .prefetch_related("issue__labels", "assignment_history")
        )
        tasks = []
        for row in rows.order_by("created_at"):
            item = payload(row.issue, row)
            item["history"] = [
                {
                    "actor_id": str(h.actor_id) if h.actor_id else None,
                    "previous_producer_id": str(h.previous_producer_id)
                    if h.previous_producer_id
                    else None,
                    "new_producer_id": str(h.new_producer_id)
                    if h.new_producer_id
                    else None,
                    "created_at": h.created_at.isoformat(),
                }
                for h in row.assignment_history.all().order_by("created_at")
            ]
            tasks.append(item)
        return Response(
            {
                "role": business_role(request.user, slug),
                "current_user_id": str(request.user.pk),
                "tasks": tasks,
            }
        )


class IzclickIssueAssignmentAPI(BaseAPIView):
    def post(self, request, slug, task_id):
        workspace = scope(request, slug)
        get_object_or_404(
            IzclickIssueCoordination,
            workspace=workspace,
            issue_id=task_id,
            issue__deleted_at__isnull=True,
        )
        data = request.data
        if (
            not isinstance(data, dict)
            or type(data.get("expected_version")) is not int
            or data["expected_version"] < 0
        ):
            raise ValidationError("Se requiere la versión actual de la carga")
        if "expected_producer_id" not in data:
            raise ValidationError(
                "Se requiere el productor anterior, o null si está pendiente"
            )
        try:
            producer = UUID(str(data.get("producer_id")))
            old = (
                str(UUID(str(data["expected_producer_id"])))
                if data["expected_producer_id"]
                else None
            )
        except (ValueError, TypeError, AttributeError):
            raise ValidationError("Identificador de productor inválido")
        row, changed = assign_issue(
            issue_id=task_id,
            slug=slug,
            actor=request.user,
            producer_id=producer,
            expected_version=data["expected_version"],
            expected_producer_id=old,
        )
        return Response(
            {
                "changed": changed,
                "version": row.version,
                "producer_id": str(row.producer_id),
            }
        )


class IzclickIssueWorkloadAPI(BaseAPIView):
    def get(self, request, slug):
        workspace = scope(request, slug)
        producers = (
            IzclickWorkspaceRole.objects.filter(
                workspace=workspace,
                role="producer",
                user__is_active=True,
                user__member_workspace__workspace=workspace,
                user__member_workspace__is_active=True,
                user__member_workspace__deleted_at__isnull=True,
            )
            .select_related("user")
            .distinct()
        )
        today = timezone.localdate()
        result = []
        for producer in producers:
            # Include native historical assignments to make the workload useful
            # before the first new intake. Reading never adopts old work items.
            ids = IssueAssignee.objects.filter(
                assignee_id=producer.user_id, workspace=workspace
            ).values("issue_id")
            issues = Issue.objects.filter(
                pk__in=ids,
                workspace=workspace,
                parent_id__isnull=True,
                archived_at__isnull=True,
                is_draft=False,
            ).exclude(state__group__in=["completed", "cancelled"])
            issues = issues.select_related(
                "project", "state", "workspace"
            ).prefetch_related("labels")
            items = [payload(issue) for issue in issues.order_by("target_date", "name")]
            dates = [issue.target_date for issue in issues]
            result.append(
                {
                    "producer_id": str(producer.user_id),
                    "producer_name": producer.user.display_name or producer.user.email,
                    "active_count": len(items),
                    "overdue_count": sum(bool(d and d < today) for d in dates),
                    "due_soon_count": sum(
                        bool(d and today <= d <= today + timedelta(days=7))
                        for d in dates
                    ),
                    "tasks": items,
                }
            )
        return Response(result)
