"""Add the approved Izango catalogue atomically; preserve IDs and individual colors."""
import json
from pathlib import Path
import unicodedata
from django.db import transaction
from django.utils import timezone
from plane.db.models import IzClickProductionStatus, IzClickProductionStatusBinding, Issue, Project, State, Workspace


def normalize_name(name):
    return " ".join("".join(c for c in unicodedata.normalize("NFD", name) if not unicodedata.combining(c)).casefold().split())


def workflow_presets():
    path = Path(__file__).with_name("izclick_workflow_presets.json")
    if not path.exists():
        path = Path(__file__).resolve().parents[3] / "web/app/lib/izclick/production-workflow-presets.json"
    return json.loads(path.read_text())


def one_match(rows, name):
    matches = [row for row in rows if normalize_name(row.name) == normalize_name(name)]
    if len(matches) > 1:
        raise ValueError(f"Hay estados duplicados para «{name}». Revísalos antes de cargar el catálogo.")
    return matches[0] if matches else None


@transaction.atomic
def install_workflow_preset(slug, actor):
    workspace = Workspace.objects.select_for_update().get(slug=slug)
    projects = list(Project.objects.filter(workspace=workspace, archived_at__isnull=True, deleted_at__isnull=True))
    catalog = list(IzClickProductionStatus.objects.select_for_update().filter(workspace=workspace))
    native_by_project = {project.pk: list(State.objects.select_for_update().filter(project=project)) for project in projects}
    created = 0
    for preset in workflow_presets():
        entry = one_match(catalog, preset["name"])
        if entry is not None and not entry.is_active:
            raise ValueError(f"«{entry.name}» está inactivo. Revisa el catálogo antes de cargar los estados.")
        if entry is None:
            fields = dict(preset)
            # Retain an existing project state's chosen color when adopting it.
            for project in projects:
                match = one_match(native_by_project[project.pk], preset["name"])
                if match is not None:
                    fields["color"] = match.color
                    break
            entry = IzClickProductionStatus.objects.create(workspace=workspace, **fields)
            catalog.append(entry)
            created += 1
        elif entry.group != preset["group"]:
            # The requested segment may differ from the older six-state preset.
            # Retain display name, chosen color, sequence and identity.
            entry.group = preset["group"]
            entry.save(update_fields=["group", "updated_at"])
        for project in projects:
            binding = IzClickProductionStatusBinding.objects.select_related("plane_state").filter(status=entry, project=project).first()
            native = binding.plane_state if binding else one_match(native_by_project[project.pk], preset["name"])
            if native is not None and (native.deleted_at or native.is_triage):
                raise ValueError(f"«{preset['name']}» no puede vincularse a un estado de admisión o retirado.")
            if native is not None and not binding and IzClickProductionStatusBinding.objects.filter(plane_state=native).exists():
                raise ValueError(f"«{preset['name']}» ya pertenece a otro estado general. No se cambió el catálogo.")
            if native is None:
                native = State.objects.create(project=project, workspace=workspace, name=entry.name,
                                              group=entry.group, color=entry.color, sequence=entry.sequence, created_by=actor)
                native_by_project[project.pk].append(native)
            elif native.group != entry.group:
                previous_group = native.group
                native.group = entry.group
                native.save(update_fields=["group"])
                issues = Issue.all_objects.filter(state=native)
                if entry.group == "completed":
                    issues.filter(completed_at__isnull=True).update(completed_at=timezone.now())
                elif previous_group == "completed":
                    issues.update(completed_at=None)
            if not binding:
                IzClickProductionStatusBinding.objects.create(status=entry, project=project, plane_state=native)
    return created
