# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from plane.db.models import StateGroup
from rest_framework import serializers


class StateSerializer(BaseSerializer):
    """
    Serializer for work item states with default state management.

    Handles state creation and updates including default state validation
    and automatic default state switching for workflow management.
    """

    def validate(self, data):
        if data.get("group", None) == StateGroup.TRIAGE.value:
            raise serializers.ValidationError("Cannot create triage state")
        return data

    class Meta:
        model = State
        fields = "__all__"
        read_only_fields = [
            "id",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "workspace",
            "project",
            "deleted_at",
            "slug",
        ]


class StateLiteSerializer(BaseSerializer):
    """
    Lightweight state serializer for minimal data transfer.

    Provides essential state information including visual properties
    and grouping data optimized for UI display and filtering.
    """

    class Meta:
        model = State
        fields = ["id", "name", "color", "group"]
        read_only_fields = fields
