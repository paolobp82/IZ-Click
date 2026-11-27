"""Bind completed, private staging uploads inside the issue creation transaction."""
from uuid import UUID

from rest_framework.exceptions import ValidationError

from plane.db.models import FileAsset


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
