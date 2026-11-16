"""Workspace-scoped business authorization shared by session and API clients."""

from django.conf import settings
from rest_framework.exceptions import PermissionDenied

from plane.db.models import IzclickWorkspaceRole, IzclickProjectCoordination, WorkspaceMember


def business_role(user, slug):
    if not getattr(settings, "IZCLICK_COORDINATION_ENABLED", False):
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
    if user.is_superuser:
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
    project_id = kwargs.get("project_id")
    # Project detail routes use pk, while nested entities use project_id.
    path = request.path.rstrip("/")
    if not project_id and "/projects/" in path and path.split("/projects/", 1)[1].count("/") == 0:
        project_id = kwargs.get("pk")
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return
    if project_id:
        if not can_write(request.user, slug, project_id):
            raise PermissionDenied("Only coordinators or the assigned producer may edit this project")
    elif path.endswith("/projects") and request.method == "POST":
        if business_role(request.user, slug) not in ("commercial", "coordinator", "superadmin"):
            raise PermissionDenied("Commercial or coordinator role required to create projects")
