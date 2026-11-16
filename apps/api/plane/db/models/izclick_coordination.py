"""IZ-Click coordination data model.

Separate from Plane project membership and project_lead: these fields represent
business workflow responsibility, not access control or the existing lead.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from .base import BaseModel


class IzclickWorkspaceRole(BaseModel):
    class Role(models.TextChoices):
        COMMERCIAL = "commercial", "Commercial"
        COORDINATOR = "coordinator", "Coordinator"
        PRODUCER = "producer", "Producer"

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="izclick_roles")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="izclick_workspace_roles")
    role = models.CharField(max_length=20, choices=Role.choices)

    class Meta:
        db_table = "izclick_workspace_roles"
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "user"],
                condition=Q(deleted_at__isnull=True),
                name="izclick_unique_active_workspace_role",
            ),
        ]


class IzclickProjectCoordination(BaseModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending coordination"
        ASSIGNED = "assigned", "Assigned"

    project = models.OneToOneField("db.Project", on_delete=models.CASCADE, related_name="izclick_coordination")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="izclick_project_coordination")
    commercial = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="izclick_originated_projects",
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="izclick_coordinated_projects",
    )
    producer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="izclick_produced_projects",
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    client = models.CharField(max_length=255, blank=True)
    start_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    workflow_status = models.CharField(
        max_length=20,
        default="active",
        choices=[("active", "Active"), ("completed", "Completed"), ("cancelled", "Cancelled")],
    )
    quotation_url = models.URLField(max_length=2048, blank=True)
    version = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "izclick_project_coordination"
        constraints = [
            models.CheckConstraint(
                condition=(Q(status="pending", producer__isnull=True) | Q(status="assigned", producer__isnull=False)),
                name="izclick_assignment_status_consistent",
            ),
        ]


class IzclickAssignmentHistory(BaseModel):
    coordination = models.ForeignKey(
        IzclickProjectCoordination, on_delete=models.CASCADE, related_name="assignment_history"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="izclick_assignment_actions"
    )
    previous_producer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="izclick_previous_assignments",
    )
    new_producer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="izclick_new_assignments"
    )

    class Meta:
        db_table = "izclick_assignment_history"
        ordering = ("-created_at",)


class IzclickEmailDelivery(BaseModel):
    """Durable mail outbox. One delivery per event and recipient.

    SMTP acceptance cannot be atomically committed with the database. A stable
    Message-ID assists provider deduplication across the crash window.
    """

    notification = models.OneToOneField("db.Notification", on_delete=models.CASCADE, related_name="izclick_email")
    sent_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveIntegerField(default=0)
    next_attempt_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True)

    class Meta:
        db_table = "izclick_email_deliveries"


class IzclickProjectComment(BaseModel):
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="izclick_comments")
    body = models.TextField(max_length=10000)

    class Meta:
        db_table = "izclick_project_comments"
        ordering = ("created_at",)


class IzclickRoleChange(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    previous_role = models.CharField(max_length=20, blank=True)
    new_role = models.CharField(max_length=20)

    class Meta:
        db_table = "izclick_role_changes"
        ordering = ("-created_at",)
