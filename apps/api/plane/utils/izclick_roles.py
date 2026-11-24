# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import transaction
from rest_framework.exceptions import ValidationError
from plane.db.models import IzclickRoleChange, IzclickWorkspaceRole, WorkspaceMember


@transaction.atomic
def set_business_role(*, workspace, user, role, actor=None):
    if role not in IzclickWorkspaceRole.Role.values:
        raise ValidationError("Invalid business role")
    WorkspaceMember.objects.select_for_update().get(workspace=workspace, member=user, is_active=True)
    row = IzclickWorkspaceRole.objects.filter(workspace=workspace, user=user).first()
    old_role = row.role if row else ""
    if old_role == role:
        return row
    row, _ = IzclickWorkspaceRole.objects.update_or_create(workspace=workspace, user=user, defaults={"role": role})
    history = IzclickRoleChange(workspace=workspace, user=user, previous_role=old_role, new_role=role, created_by=actor)
    history.save(disable_auto_set_user=True)
    return row
