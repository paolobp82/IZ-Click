"""IZ-Click workspace-wide Production status catalogue.

Plane State remains project-scoped for native edit/kanban behavior. A status
belongs to a workspace and is bound to a native State for every project.
Never infer binding identity solely from a display name during edits.
"""
import uuid

from django.db import models

from .state import StateGroup


class IzClickProductionStatus(models.Model):
    id = models.UUIDField(default=uuid.uuid4, primary_key=True, editable=False)
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="izclick_production_statuses")
    name = models.CharField(max_length=120)
    color = models.CharField(max_length=7, default="#64748b")
    group = models.CharField(max_length=20, choices=StateGroup.choices, default=StateGroup.UNSTARTED)
    sequence = models.PositiveIntegerField(default=1000)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "izclick_production_statuses"
        ordering = ("sequence", "created_at")
        constraints = [
            models.UniqueConstraint(fields=["workspace", "name"], name="izclick_status_unique_workspace_name")
        ]


class IzClickProductionStatusBinding(models.Model):
    id = models.UUIDField(default=uuid.uuid4, primary_key=True, editable=False)
    status = models.ForeignKey(
        "db.IzClickProductionStatus", on_delete=models.CASCADE, related_name="project_bindings"
    )
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="izclick_status_bindings")
    plane_state = models.ForeignKey("db.State", on_delete=models.CASCADE, related_name="izclick_workspace_bindings")

    class Meta:
        db_table = "izclick_production_status_bindings"
        constraints = [
            models.UniqueConstraint(fields=["status", "project"], name="izclick_binding_unique_status_project"),
            models.UniqueConstraint(fields=["plane_state"], name="izclick_binding_unique_plane_state"),
        ]
