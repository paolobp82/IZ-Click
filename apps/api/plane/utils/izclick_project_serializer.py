from django.conf import settings
from rest_framework import serializers


class CoordinationProjectSerializerMixin(serializers.Serializer):
    coordination = serializers.SerializerMethodField()

    def get_coordination(self, project):
        if not getattr(settings, "IZCLICK_COORDINATION_ENABLED", False):
            return None
        from plane.db.models import IzclickProjectCoordination

        try:
            row = project.izclick_coordination
        except IzclickProjectCoordination.DoesNotExist:
            return None
        return {
            "producer_id": row.producer_id,
            "commercial_id": row.commercial_id,
            "producer_name": (row.producer.display_name or row.producer.email) if row.producer else None,
            "status": row.status,
            "version": row.version,
        }
