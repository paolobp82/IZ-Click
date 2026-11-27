"""Bind completed, private staging uploads inside the issue creation transaction."""
from uuid import UUID

from rest_framework.exceptions import ValidationError

from plane.db.models import FileAsset, Project


def attach_creation_uploads(issue, actor, asset_ids):
    if not isinstance(asset_ids, list) or len(asset_ids) > 100:
        raise ValidationError({"attachment_asset_ids": "Envía una lista de hasta 100 archivos."})
    try:
        ids = [UUID(str(value)) for value in asset_ids]
    except (ValueError, TypeError, AttributeError):
        raise ValidationError({"attachment_asset_ids": "Identificador de archivo inválido."})
    if len(set(ids)) != len(ids):
        raise ValidationError({"attachment_asset_ids": "Hay archivos repetidos."})
    if not ids:
        return
    # Locks prevent two simultaneous creations from claiming the same staged asset.
    assets = list(FileAsset.objects.select_for_update().filter(
        id__in=ids, workspace_id=issue.workspace_id, project_id=issue.project_id,
        created_by=actor, entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
        is_uploaded=True, is_deleted=False, issue_id__isnull=True,
        draft_issue_id__isnull=True,
    ))
    if len(assets) != len(ids):
        raise ValidationError({"attachment_asset_ids":
            "Uno o más archivos no están listos o no pertenecen a esta tarea. Revisa los adjuntos."})
    for asset in assets:
        asset.issue_id = issue.pk
        asset.save(update_fields=["issue_id"])


def can_stage_creation_attachment(request, kwargs):
    """Narrow commercial exception shared by business and native permissions."""
    from plane.utils.izclick_access import business_role
    slug, project_id = kwargs.get("slug"), kwargs.get("project_id")
    if not slug or not project_id or business_role(request.user, slug) != "commercial":
        return False
    prefix = f"/api/assets/v2/workspaces/{slug}/projects/{project_id}/"
    if not request.path.startswith(prefix):
        return False
    staging = (request.method == "POST" and request.path == prefix
        and request.data.get("entity_type") == "ISSUE_ATTACHMENT"
        and not request.data.get("entity_identifier"))
    own_pending = (request.method in ("PATCH", "DELETE") and FileAsset.objects.filter(
        pk=kwargs.get("pk"), workspace__slug=slug, project_id=project_id,
        created_by=request.user, entity_type="ISSUE_ATTACHMENT", issue_id__isnull=True,
    ).exists())
    return (staging or own_pending) and Project.objects.filter(pk=project_id, workspace__slug=slug).exists()
