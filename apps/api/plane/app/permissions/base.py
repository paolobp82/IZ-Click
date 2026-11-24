# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from plane.db.models import WorkspaceMember, ProjectMember
from functools import wraps
from rest_framework.response import Response
from rest_framework import status

from enum import Enum


class ROLE(Enum):
    ADMIN = 20
    MEMBER = 15
    GUEST = 5


def allow_permission(allowed_roles, level="PROJECT", creator=False, model=None):
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(instance, request, *args, **kwargs):
            from plane.utils.izclick_access import business_role, can_write
            slug = kwargs.get("slug")
            role = business_role(request.user, slug) if slug else None
            project_id = kwargs.get("project_id") or kwargs.get("pk")
            member_operation = any(getattr(item, "value", item) in (5, 15) for item in allowed_roles)
            if role == "commercial" and level == "PROJECT" and member_operation and request.method == "POST" and request.path.rstrip("/").endswith("/issues"):
                return view_func(instance, request, *args, **kwargs)
            if role and level == "PROJECT" and member_operation and request.method in ("GET", "HEAD", "OPTIONS"):
                return view_func(instance, request, *args, **kwargs)
            if role in ("coordinator", "superadmin") and level == "PROJECT" and member_operation and project_id:
                return view_func(instance, request, *args, **kwargs)
            if role == "producer" and level == "PROJECT" and member_operation and project_id and "/issues/" in request.path:
                from plane.utils.izclick_issue_intake import managed_issue
                row = managed_issue(kwargs.get("issue_id") or kwargs.get("pk"), project_id, slug)
                if row and row.producer_id == request.user.pk:
                    return view_func(instance, request, *args, **kwargs)
            if role == "producer" and level == "PROJECT" and project_id and can_write(request.user, slug, project_id):
                if ROLE.MEMBER in allowed_roles or 15 in allowed_roles:
                    return view_func(instance, request, *args, **kwargs)
            # Check for creator if required
            if creator and model:
                # check if the user is part of the workspace or not
                if not WorkspaceMember.objects.filter(
                    member=request.user,
                    workspace__slug=kwargs["slug"],
                    is_active=True,
                ).exists():
                    return Response(
                        {"error": "You don't have the required permissions."},
                        status=status.HTTP_403_FORBIDDEN,
                    )

                obj = model.objects.filter(id=kwargs["pk"], created_by=request.user).exists()
                if obj:
                    return view_func(instance, request, *args, **kwargs)

            # Convert allowed_roles to their values if they are enum members
            allowed_role_values = [role.value if isinstance(role, ROLE) else role for role in allowed_roles]

            # Check role permissions
            if level == "WORKSPACE":
                if WorkspaceMember.objects.filter(
                    member=request.user,
                    workspace__slug=kwargs["slug"],
                    role__in=allowed_role_values,
                    is_active=True,
                ).exists():
                    return view_func(instance, request, *args, **kwargs)
            else:
                is_user_has_allowed_role = ProjectMember.objects.filter(
                    member=request.user,
                    workspace__slug=kwargs["slug"],
                    project_id=kwargs["project_id"],
                    role__in=allowed_role_values,
                    is_active=True,
                ).exists()

                # Return if the user has the allowed role else if they are workspace admin and part of the project regardless of the role # noqa: E501
                if is_user_has_allowed_role:
                    return view_func(instance, request, *args, **kwargs)
                elif (
                    ProjectMember.objects.filter(
                        member=request.user,
                        workspace__slug=kwargs["slug"],
                        project_id=kwargs["project_id"],
                        is_active=True,
                    ).exists()
                    and WorkspaceMember.objects.filter(
                        member=request.user,
                        workspace__slug=kwargs["slug"],
                        role=ROLE.ADMIN.value,
                        is_active=True,
                    ).exists()
                ):
                    return view_func(instance, request, *args, **kwargs)

            # Return permission denied if no conditions are met
            return Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return _wrapped_view

    return decorator
