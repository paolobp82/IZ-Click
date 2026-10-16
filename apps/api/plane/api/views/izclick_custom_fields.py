"""Project-scoped IZ-Click custom fields for the authenticated application."""
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from rest_framework.response import Response
from rest_framework import status

from plane.db.models import (
    Project, ProjectMember, Issue, IzclickCustomField, IzclickCustomFieldValue,
)
from plane.app.views.base import BaseAPIView


def project_access(request, slug, project_id, write=False, schema=False):
    project = Project.objects.filter(id=project_id, workspace__slug=slug, archived_at__isnull=True).first()
    if not project:
        return None
    member = ProjectMember.objects.filter(
        project_id=project_id, member=request.user, is_active=True
    ).first()
    if not member:
        return None
    minimum_role = 20 if schema else (15 if write else 5)
    return project if member.role >= minimum_role else None


def field_payload(field):
    return {
        "id": str(field.id), "project_id": str(field.project_id),
        "name": field.name, "type": field.field_type,
        "options": field.options, "position": field.position,
    }


class IzclickProjectCustomFieldsAPI(BaseAPIView):
    def get(self, request, slug, project_id):
        if not project_access(request, slug, project_id):
            return Response(status=status.HTTP_403_FORBIDDEN)
        fields = IzclickCustomField.objects.filter(project_id=project_id)
        return Response([field_payload(field) for field in fields])

    def post(self, request, slug, project_id):
        if not project_access(request, slug, project_id, schema=True):
            return Response(status=status.HTTP_403_FORBIDDEN)
        name = request.data.get("name")
        kind = request.data.get("type")
        options = request.data.get("options", [])
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 100:
            return Response({"name": "Nombre obligatorio (máximo 100 caracteres)."}, status=400)
        if kind not in dict(IzclickCustomField.TYPES):
            return Response({"type": "Tipo no admitido."}, status=400)
        field = IzclickCustomField(project_id=project_id, name=name.strip(), field_type=kind, options=options, created_by=request.user, updated_by=request.user)
        try:
            field.full_clean()
            field.save(disable_auto_set_user=True)
        except (ValidationError, IntegrityError) as exc:
            return Response({"error": str(exc)}, status=400)
        return Response(field_payload(field), status=201)


class IzclickProjectCustomFieldDetailAPI(BaseAPIView):
    def patch(self, request, slug, project_id, field_id):
        if not project_access(request, slug, project_id, schema=True):
            return Response(status=403)
        field = IzclickCustomField.objects.filter(id=field_id, project_id=project_id).first()
        if not field:
            return Response(status=404)
        if "name" in request.data:
            name = request.data["name"]
            if not isinstance(name, str) or not name.strip() or len(name.strip()) > 100:
                return Response({"name": "Nombre inválido."}, status=400)
            field.name = name.strip()
        if "options" in request.data:
            field.options = request.data["options"]
        if "position" in request.data:
            position = request.data["position"]
            if not isinstance(position, int) or isinstance(position, bool) or position < 0:
                return Response({"position": "Orden inválido."}, status=400)
            field.position = position
        try:
            field.updated_by = request.user
            field.full_clean()
            field.save(disable_auto_set_user=True)
        except (ValidationError, IntegrityError) as exc:
            return Response({"error": str(exc)}, status=400)
        return Response(field_payload(field))

    def delete(self, request, slug, project_id, field_id):
        if not project_access(request, slug, project_id, schema=True):
            return Response(status=403)
        field = IzclickCustomField.objects.filter(id=field_id, project_id=project_id).first()
        if not field:
            return Response(status=404)
        if field.values.exists() and request.query_params.get("confirm") != "true":
            return Response({"error": "El campo tiene valores. Confirma su eliminación explícitamente."}, status=409)
        field.delete()
        return Response(status=204)


class IzclickProjectCustomFieldBulkValuesAPI(BaseAPIView):
    """Retrieve values for visible project issues in one session-authenticated call."""

    def post(self, request, slug, project_id):
        if not project_access(request, slug, project_id):
            return Response(status=403)
        issue_ids = request.data.get("issue_ids")
        if (
            not isinstance(issue_ids, list)
            or not issue_ids
            or len(issue_ids) > 200
            or any(not isinstance(item, str) for item in issue_ids)
        ):
            return Response({"issue_ids": "Lista de entre 1 y 200 tareas requerida."}, status=400)
        from uuid import UUID

        try:
            normalized = [str(UUID(item)) for item in issue_ids]
        except (ValueError, AttributeError, TypeError):
            return Response({"issue_ids": "ID de tarea inválido."}, status=400)
        valid_issue_ids = set(
            str(item) for item in Issue.objects.filter(
                project_id=project_id, id__in=normalized
            ).values_list("id", flat=True)
        )
        results = {issue_id: {} for issue_id in normalized if issue_id in valid_issue_ids}
        for item in IzclickCustomFieldValue.objects.filter(
            issue_id__in=valid_issue_ids, field__project_id=project_id
        ).only("issue_id", "field_id", "value"):
            results[str(item.issue_id)][str(item.field_id)] = item.value
        return Response(results)


class IzclickIssueCustomFieldValuesAPI(BaseAPIView):
    def get(self, request, slug, project_id, issue_id):
        if not project_access(request, slug, project_id):
            return Response(status=403)
        if not Issue.objects.filter(id=issue_id, project_id=project_id).exists():
            return Response(status=404)
        values = IzclickCustomFieldValue.objects.filter(
            issue_id=issue_id, field__project_id=project_id
        ).select_related("field")
        return Response({str(item.field_id): item.value for item in values})

    def patch(self, request, slug, project_id, issue_id):
        if not project_access(request, slug, project_id, write=True):
            return Response(status=403)
        if not Issue.objects.filter(id=issue_id, project_id=project_id).exists():
            return Response(status=404)
        values = request.data.get("values")
        if not isinstance(values, dict):
            return Response({"values": "Se requiere un objeto de campo:valor."}, status=400)
        if len(values) > 100:
            return Response({"values": "Demasiados campos."}, status=400)
        # All-or-nothing: validate before creating or updating any field values.
        try:
            with transaction.atomic():
                for field_id, value in values.items():
                    field = IzclickCustomField.objects.get(id=field_id, project_id=project_id)
                    record = IzclickCustomFieldValue.objects.select_for_update().filter(
                        field=field, issue_id=issue_id
                    ).first()
                    if record is None:
                        record = IzclickCustomFieldValue(
                            field=field, issue_id=issue_id, created_by=request.user
                        )
                    record.value = value
                    record.updated_by = request.user
                    record.full_clean()
                    record.save(disable_auto_set_user=True)
        except (IzclickCustomField.DoesNotExist, ValidationError, ValueError, TypeError, IntegrityError) as exc:
            return Response({"error": str(exc)}, status=400)
        return self.get(request, slug, project_id, issue_id)
