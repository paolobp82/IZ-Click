# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.conf import settings
from django.db import models
from django.db.models import Q
from .base import BaseModel


class IzclickIssueCoordination(BaseModel):
    issue = models.OneToOneField(
        "db.Issue", on_delete=models.CASCADE, related_name="izclick_intake"
    )
    workspace = models.ForeignKey(
        "db.Workspace", on_delete=models.CASCADE, related_name="izclick_issue_intakes"
    )
    commercial = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="izclick_requested_issues",
    )
    producer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="izclick_assigned_issues",
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="izclick_coordinated_issues",
    )
    status = models.CharField(
        max_length=12,
        choices=[("pending", "Pending"), ("assigned", "Assigned")],
        default="pending",
    )
    version = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "izclick_issue_coordination"
        constraints = [
            models.CheckConstraint(
                condition=Q(status="pending", producer__isnull=True)
                | Q(status="assigned", producer__isnull=False),
                name="izclick_issue_assignment_consistent",
            )
        ]


class IzclickIssueAssignmentHistory(BaseModel):
    coordination = models.ForeignKey(
        IzclickIssueCoordination,
        on_delete=models.CASCADE,
        related_name="assignment_history",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="izclick_issue_assignment_actions",
    )
    previous_producer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="izclick_previous_issue_assignments",
    )
    new_producer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="izclick_new_issue_assignments",
    )

    class Meta:
        db_table = "izclick_issue_assignment_history"
