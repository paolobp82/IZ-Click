# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workspace-scoped business authorization shared by session and API clients."""

from django.conf import settings
from rest_framework.exceptions import PermissionDenied

from plane.db.models import IzclickWorkspaceRole, IzclickProjectCoordination, WorkspaceMember


def coordination_enabled(slug):
    workspaces = getattr(settings, "IZCLICK_COORDINATION_WORKSPACES", [])
    return getattr(settings, "IZCLICK_COORDINATION_ENABLED", False) and (not workspaces or slug in workspaces)


def is_business_superadmin(user):
    return user.is_superuser or str(user.pk) in getattr(settings, "IZCLICK_COORDINATION_SUPERADMINS", [])


def business_role(user, slug):
    if not coordination_enabled(slug):
        return None
    if not user.is_authenticated or not user.is_active:
        return None
    if not WorkspaceMember.objects.filter(
        workspace__slug=slug,
        member=user,
        is_active=True,
        deleted_at__isnull=True,
    ).exists():
        return None
    if is_business_superadmin(user):
        return "superadmin"
    return (
        IzclickWorkspaceRole.objects.filter(
            workspace__slug=slug,
            user=user,
            deleted_at__isnull=True,
        )
        .values_list("role", flat=True)
        .first()
    )


def can_write(user, slug, project_id):
    role = business_role(user, slug)
    return role in ("superadmin", "coordinator") or (
        role == "producer"
        and IzclickProjectCoordination.objects.filter(
            project_id=project_id,
            workspace__slug=slug,
            producer=user,
        ).exists()
    )


def enforce_business_access(request, kwargs):
    """Additional restriction; never turns an absent Plane membership into write access."""
    if not getattr(settings, "IZCLICK_COORDINATION_ENABLED", False):
        return
    slug = kwargs.get("slug")
    if not slug or not request.user.is_authenticated:
        return
    if not coordination_enabled(slug):
        return
    from plane.utils.izclick_creation_attachments import can_stage_creation_attachment
    if can_stage_creation_attachment(request, kwargs):
        return
    from plane.utils.izclick_issue_intake import enforce_issue_write
    if enforce_issue_write(request, kwargs):
        return
    project_id = kwargs.get("project_id")
    # Project detail routes use pk, while nested entities use project_id.
    path = request.path.rstrip("/")
    if not project_id and "/projects/" in path and path.split("/projects/", 1)[1].count("/") == 0:
        project_id = kwargs.get("pk")
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return
    # This legacy endpoint uses POST only to submit a list of IDs to read.
    # Its own project-access check still requires authenticated agency access.
    if request.method == "POST" and path.endswith("/izclick-custom-field-values/batch"):
        return
    if project_id:
        # Historical lists retain their existing permissions until explicitly
        # adopted into coordination. Never reinterpret existing task assignments.
        if not IzclickProjectCoordination.objects.filter(project_id=project_id, workspace__slug=slug).exists():
            return
        if not can_write(request.user, slug, project_id):
            raise PermissionDenied("Only coordinators or the assigned producer may edit this project")
    elif path.endswith("/projects") and request.method == "POST":
        if business_role(request.user, slug) not in ("commercial", "coordinator", "superadmin"):
            raise PermissionDenied("Commercial or coordinator role required to create projects")
