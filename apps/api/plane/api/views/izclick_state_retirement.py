from uuid import UUID
from django.db import transaction
from rest_framework.response import Response
from plane.app.views.base import BaseAPIView
from plane.api.views.izclick_custom_fields import project_access
from plane.db.models import State, IzClickProductionStatusBinding, Project
from plane.utils.izclick_state_retirement import retire_state
from plane.utils.cache import invalidate_cache


class IzclickProjectStateRetirementAPI(BaseAPIView):
    @invalidate_cache(path="workspaces/:slug/states/", url_params=True, user=False)
    def post(self, request, slug, project_id, state_id):
        if not project_access(request, slug, project_id, schema=True):
            return Response(status=403)
        try:
            replacement_id = UUID(str(request.data.get("replacement_id", "")))
        except ValueError:
            return Response({"error": "Selecciona el estado al que se moverán las tareas."}, status=400)
        with transaction.atomic():
            Project.objects.select_for_update().get(pk=project_id)
            rows = list(State.objects.select_for_update().filter(
                project_id=project_id, id__in=[state_id, replacement_id], is_triage=False,
            ).order_by("id"))
            by_id = {str(state.pk): state for state in rows}
            source, target = by_id.get(str(state_id)), by_id.get(str(replacement_id))
            if not source or not target or source.pk == target.pk:
                return Response({"error": "Elige otro estado existente del mismo proyecto."}, status=400)
            if IzClickProductionStatusBinding.objects.filter(plane_state=source).exists():
                return Response({"error": "Este estado pertenece al catálogo general. Elimínalo desde Administrar estados."}, status=409)
            moved = retire_state(source, target, request.user)
        return Response({"moved": moved})
