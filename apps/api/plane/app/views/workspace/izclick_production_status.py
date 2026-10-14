"""Workspace-scoped Production statuses backed by project-native Plane states.

No native states or issues are deleted or reassigned. Only workspace admins
can write. Writes across projects are atomic and bindings preserve identity.
"""
from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.permissions.workspace import WorkspaceEntityPermission
from plane.app.views.base import BaseAPIView
from plane.db.models import (
    IzClickProductionStatus, IzClickProductionStatusBinding,
    Project, State, Workspace,
)

from plane.utils.izclick_workflow import validate_status_fields


class WorkspaceProductionStatusesEndpoint(BaseAPIView):
    permission_classes = [WorkspaceEntityPermission]

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        catalog = IzClickProductionStatus.objects.filter(
            workspace__slug=slug, is_active=True
        ).order_by("sequence", "created_at")
        return Response([serialize_status(row) for row in catalog], status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        fields, error = validate_status_fields(request.data)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)
        try:
            with transaction.atomic():
                workspace = Workspace.objects.select_for_update().get(slug=slug)
                if IzClickProductionStatus.objects.filter(
                    workspace=workspace, name__iexact=fields["name"]
                ).exists():
                    return Response({"error": "Ese estado ya existe en el catálogo general."}, status=status.HTTP_409_CONFLICT)
                projects = list(Project.objects.filter(
                    workspace=workspace, archived_at__isnull=True, deleted_at__isnull=True
                ))
                # Reject collisions with existing unmapped Plane states; no silent remapping.
                collision = State.objects.filter(
                    project__in=projects, name__iexact=fields["name"], deleted_at__isnull=True
                ).exists()
                if collision:
                    return Response({
                        "error": "Este nombre ya existe en algún proyecto de Plane. Antes de importarlo se requiere reconciliar los estados existentes."
                    }, status=status.HTTP_409_CONFLICT)
                entry = IzClickProductionStatus.objects.create(workspace=workspace, **fields)
                for project in projects:
                    native = State.objects.create(
                        project=project, workspace=workspace, name=entry.name,
                        color=entry.color, group=entry.group, created_by=request.user
                    )
                    IzClickProductionStatusBinding.objects.create(
                        status=entry, project=project, plane_state=native
                    )
                return Response(serialize_status(entry), status=status.HTTP_201_CREATED)
        except IntegrityError:
            return Response({"error": "El estado ya existe. Actualiza la vista."}, status=status.HTTP_409_CONFLICT)


class WorkspaceProductionStatusDetailEndpoint(BaseAPIView):
    permission_classes = [WorkspaceEntityPermission]

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, status_id):
        fields, error = validate_status_fields(request.data, partial=True)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)
        try:
            with transaction.atomic():
                workspace = Workspace.objects.select_for_update().get(slug=slug)
                entry = IzClickProductionStatus.objects.select_for_update().filter(
                    workspace=workspace, pk=status_id, is_active=True
                ).first()
                if entry is None:
                    return Response({"error": "Estado no encontrado."}, status=status.HTTP_404_NOT_FOUND)
                name = fields.get("name", entry.name)
                if IzClickProductionStatus.objects.filter(workspace=workspace, name__iexact=name).exclude(pk=entry.id).exists():
                    return Response({"error": "Ya existe un estado con ese nombre."}, status=status.HTTP_409_CONFLICT)
                bindings = list(IzClickProductionStatusBinding.objects.select_related("plane_state", "project").filter(status=entry))
                for binding in bindings:
                    if State.objects.filter(project=binding.project, name__iexact=name, deleted_at__isnull=True).exclude(pk=binding.plane_state_id).exists():
                        return Response({"error": "El nombre ya se usa en un proyecto; no se cambiaron estados."}, status=status.HTTP_409_CONFLICT)
                for key, value in fields.items():
                    setattr(entry, key, value)
                entry.save()
                for binding in bindings:
                    native = binding.plane_state
                    native.name = entry.name
                    native.color = entry.color
                    native.group = entry.group
                    native.save(update_fields=["name", "slug", "color", "group"])
                return Response(serialize_status(entry), status=status.HTTP_200_OK)
        except IntegrityError:
            return Response({"error": "Conflicto de estados. No se guardaron cambios."}, status=status.HTTP_409_CONFLICT)
