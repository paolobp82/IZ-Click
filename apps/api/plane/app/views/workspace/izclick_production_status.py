"""Workspace-scoped Production statuses backed by project-native Plane states.

Only workspace admins can write. State retirement reassigns work items atomically
and preserves their IDs, attachments and history.
"""
from django.db import IntegrityError, transaction
from django.db.models import Count
from uuid import UUID
from plane.utils.izclick_state_retirement import retire_state
from plane.utils.cache import invalidate_cache
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


def serialize_status(entry):
    """Match the deployed frontend contract without exposing model internals."""
    project_count = getattr(entry, "project_count", None)
    if project_count is None:
        project_count = entry.project_bindings.count()
    return {
        "id": str(entry.id),
        "name": entry.name,
        "color": entry.color,
        "group": entry.group,
        "sequence": entry.sequence,
        "project_count": project_count,
        "is_active": entry.is_active,
        "origin": "catalogue",
    }


def unbound_states(workspace):
    """Expose native states without creating catalogue records during a read."""
    return State.objects.filter(
        workspace=workspace, project__deleted_at__isnull=True, is_triage=False,
    ).exclude(pk__in=IzClickProductionStatusBinding.objects.values("plane_state_id"))


def serialize_native_states(states):
    representative = states[0]
    return {
        "id": str(representative.pk), "name": representative.name,
        "color": representative.color, "group": representative.group,
        "sequence": max(0, min(1000000, int(representative.sequence))),
        "project_count": len({row.project_id for row in states}),
        "is_active": True, "origin": "plane",
    }


def resolve_status(workspace, status_id):
    """Resolve either a catalogue ID or a listed native-state representative.

    Callers hold the workspace lock for mutations. Native states with the same
    name and workflow group are administered together across this workspace.
    """
    entry = IzClickProductionStatus.objects.filter(
        workspace=workspace, pk=status_id, is_active=True,
    ).first()
    if entry:
        states = list(State.objects.filter(
            izclick_workspace_bindings__status=entry,
        ).order_by("id"))
        return entry, states
    native = unbound_states(workspace).filter(pk=status_id).first()
    if native is None:
        return None, []
    return None, list(unbound_states(workspace).filter(
        name__iexact=native.name, group=native.group,
    ).order_by("id"))


class WorkspaceProductionStatusesEndpoint(BaseAPIView):
    permission_classes = [WorkspaceEntityPermission]

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        catalog = IzClickProductionStatus.objects.filter(
            workspace__slug=slug, is_active=True
        ).annotate(project_count=Count("project_bindings")).order_by("sequence", "created_at")
        workspace = Workspace.objects.get(slug=slug)
        native_groups = {}
        for row in unbound_states(workspace).order_by("id"):
            native_groups.setdefault((row.name.lower(), row.group), []).append(row)
        entries = [serialize_status(row) for row in catalog]
        entries.extend(serialize_native_states(rows) for rows in native_groups.values())
        entries.sort(key=lambda row: (row["sequence"], row["name"].lower(), row["id"]))
        return Response(entries, status=status.HTTP_200_OK)

    @invalidate_cache(path="workspaces/:slug/states/", url_params=True, user=False)
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
                # Resolve equal-name native states without changing their IDs,
                # group, or the issues that already point to them. Refuse ambiguous
                # duplicate matches and states already bound to another catalogue entry.
                matches = {}
                for project in projects:
                    candidates = list(
                        State.objects.filter(
                            project=project, name__iexact=fields["name"], deleted_at__isnull=True
                        )
                    )
                    if len(candidates) > 1:
                        return Response({
                            "error": "Hay estados homónimos en un proyecto. Se requiere revisión manual antes de vincular."
                        }, status=status.HTTP_409_CONFLICT)
                    if candidates:
                        candidate = candidates[0]
                        if IzClickProductionStatusBinding.objects.filter(plane_state=candidate).exists():
                            return Response({
                                "error": "El estado existente ya está vinculado a otro estado general."
                            }, status=status.HTTP_409_CONFLICT)
                        if candidate.group != fields["group"]:
                            return Response({
                                "error": "El estado existente pertenece a otro grupo de flujo. Revísalo antes de vincular."
                            }, status=status.HTTP_409_CONFLICT)
                        matches[project.pk] = candidate

                entry = IzClickProductionStatus.objects.create(workspace=workspace, **fields)
                for project in projects:
                    native = matches.get(project.pk)
                    if native is None:
                        native = State.objects.create(
                            project=project, workspace=workspace, name=entry.name,
                            color=entry.color, group=entry.group,
                            sequence=entry.sequence, created_by=request.user
                        )
                    IzClickProductionStatusBinding.objects.create(
                        status=entry, project=project, plane_state=native
                    )
                return Response(serialize_status(entry), status=status.HTTP_201_CREATED)
        except IntegrityError:
            return Response({"error": "El estado ya existe. Actualiza la vista."}, status=status.HTTP_409_CONFLICT)


class WorkspaceProductionStatusDetailEndpoint(BaseAPIView):
    permission_classes = [WorkspaceEntityPermission]

    @invalidate_cache(path="workspaces/:slug/states/", url_params=True, user=False)
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, status_id):
        fields, error = validate_status_fields(request.data, partial=True)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)
        try:
            with transaction.atomic():
                workspace = Workspace.objects.select_for_update().get(slug=slug)
                entry, states = resolve_status(workspace, status_id)
                if entry is None and not states:
                    return Response({"error": "Estado no encontrado."}, status=status.HTTP_404_NOT_FOUND)
                state_ids = [row.pk for row in states]
                states = list(State.objects.select_for_update().filter(pk__in=state_ids).order_by("id"))
                if len(states) != len(state_ids):
                    return Response({"error": "Cambió un estado de proyecto. Actualiza antes de editar."}, status=409)
                name = fields.get("name", entry.name if entry else states[0].name)
                if IzClickProductionStatus.objects.filter(workspace=workspace, name__iexact=name).exclude(pk=entry.pk if entry else None).exists():
                    return Response({"error": "Ya existe un estado con ese nombre."}, status=status.HTTP_409_CONFLICT)
                for native in states:
                    if State.objects.filter(project_id=native.project_id, name__iexact=name).exclude(pk=native.pk).exists():
                        return Response({"error": "El nombre ya se usa en un proyecto; no se cambiaron estados."}, status=status.HTTP_409_CONFLICT)
                if entry:
                    for key, value in fields.items():
                        setattr(entry, key, value)
                    entry.save()
                for native in states:
                    for key, value in fields.items():
                        setattr(native, key, value)
                    native.updated_by = request.user
                    native.save(update_fields=[*fields, "slug", "updated_by", "updated_at"], disable_auto_set_user=True)
                result = serialize_status(entry) if entry else serialize_native_states(states)
                return Response(result, status=status.HTTP_200_OK)
        except IntegrityError:
            return Response({"error": "Conflicto de estados. No se guardaron cambios."}, status=status.HTTP_409_CONFLICT)


    @invalidate_cache(path="workspaces/:slug/states/", url_params=True, user=False)
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, status_id):
        try:
            replacement_id = UUID(str(request.query_params.get("replacement_id", "")))
        except ValueError:
            return Response({"error": "Selecciona el estado general de destino."}, status=400)
        with transaction.atomic():
            workspace = Workspace.objects.select_for_update().get(slug=slug)
            source, source_states = resolve_status(workspace, status_id)
            target, target_states = resolve_status(workspace, replacement_id)
            if str(status_id) == str(replacement_id) or (source is None and not source_states) or (target is None and not target_states):
                return Response({"error": "Elige otro estado general activo."}, status=400)
            destinations = {}
            for row in target_states:
                if row.project_id in destinations:
                    return Response({"error": "El destino es ambiguo en un proyecto. No se cambió ningún estado."}, status=409)
                destinations[row.project_id] = row.pk
            if any(row.project_id not in destinations for row in source_states):
                return Response({"error": "El destino no está vinculado a todos los proyectos. No se cambió ningún estado."}, status=409)
            state_ids = [row.pk for row in source_states] + list(destinations.values())
            locked = {row.pk: row for row in State.objects.select_for_update().filter(id__in=state_ids).order_by("id")}
            if any(row.pk not in locked or destinations[row.project_id] not in locked for row in source_states):
                return Response({"error": "Cambió un estado de proyecto. Actualiza antes de eliminar."}, status=409)
            moved = sum(retire_state(locked[row.pk], locked[destinations[row.project_id]], request.user) for row in source_states)
            if source:
                source.delete()  # Catalogue/bindings only; native states are already retired.
        return Response({"moved": moved})
