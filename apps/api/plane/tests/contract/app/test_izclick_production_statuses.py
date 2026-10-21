"""Restore the deployed catalogue contract while preserving native identities."""
from unittest.mock import patch

import pytest
from django.db import transaction

from plane.db.models import (
    Issue, IzClickProductionStatus, IzClickProductionStatusBinding,
    Project, ProjectMember, State, Workspace, WorkspaceMember,
)

pytestmark = [pytest.mark.contract, pytest.mark.django_db]


@pytest.fixture
def production(session_client, workspace, create_user):
    project = Project.objects.create(name="Produccion", identifier="PRO", workspace=workspace)
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    original = State.objects.create(project=project, name="Existente", color="#123456", group="backlog", default=True)
    issue = Issue.objects.create(project=project, workspace=workspace, name="Existing task", state=original)
    url = f"/api/workspaces/{workspace.slug}/izclick-production-statuses/"
    return session_client, workspace, project, original, issue, url


def payload(name="En revision"):
    return {"name": name, "color": "#AABBCC", "group": "started", "sequence": 500}


def assert_unchanged(original, issue):
    original.refresh_from_db()
    issue.refresh_from_db()
    assert original.name == "Existente"
    assert original.color == "#123456"
    assert original.group == "backlog"
    assert original.default is True
    assert issue.state_id == original.id


def test_create_list_and_patch_preserve_existing_workflow(production):
    client, workspace, project, original, issue, url = production
    response = client.post(url, payload(), format="json")
    assert response.status_code == 201, response.data
    assert response.data["project_count"] == 1
    assert response.data["color"] == "#aabbcc"
    entry = IzClickProductionStatus.objects.get(id=response.data["id"])
    binding = entry.project_bindings.get(project=project)
    native_id = binding.plane_state_id
    assert binding.plane_state.group == "started"
    listing = client.get(url)
    assert listing.status_code == 200
    assert listing.data == [response.data]
    updated = client.patch(f"{url}{entry.id}/", {"name": "En comercial", "color": "#112233"}, format="json")
    assert updated.status_code == 200, updated.data
    binding.refresh_from_db()
    assert binding.plane_state_id == native_id
    assert binding.plane_state.name == "En comercial"
    assert binding.plane_state.group == "started"
    assert_unchanged(original, issue)


def test_equal_name_native_state_is_bound_without_reassignment(production):
    client, workspace, project, original, issue, url = production
    response = client.post(url, {**payload("Existente"), "group": "backlog"}, format="json")
    assert response.status_code == 201, response.data
    assert IzClickProductionStatusBinding.objects.get(status_id=response.data["id"]).plane_state_id == original.id
    assert State.objects.filter(project=project).count() == 1
    assert_unchanged(original, issue)


def test_duplicate_and_group_conflict_leave_no_partial_writes(production):
    client, workspace, project, original, issue, url = production
    conflict = client.post(url, payload("Existente"), format="json")
    assert conflict.status_code == 409
    assert not IzClickProductionStatus.objects.exists()
    assert not IzClickProductionStatusBinding.objects.exists()
    assert client.post(url, payload(), format="json").status_code == 201
    duplicate = client.post(url, payload("EN REVISION"), format="json")
    assert duplicate.status_code == 409
    assert IzClickProductionStatus.objects.count() == 1
    assert State.objects.filter(project=project).count() == 2
    assert_unchanged(original, issue)


def test_member_cannot_create_catalogue_entries(production, create_user):
    client, workspace, project, original, issue, url = production
    WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=15)
    denied = client.post(url, payload(), format="json")
    assert denied.status_code == 403
    assert not IzClickProductionStatus.objects.exists()
    assert_unchanged(original, issue)


def test_catalogue_is_workspace_scoped(production, create_user):
    client, workspace, project, original, issue, url = production
    other = Workspace.objects.create(name="Other", slug="other", owner=create_user)
    foreign = IzClickProductionStatus.objects.create(workspace=other, name="Foreign")
    assert client.get(url).data == []
    assert client.patch(f"{url}{foreign.id}/", {"name": "Changed"}, format="json").status_code == 404
    foreign.refresh_from_db()
    assert foreign.name == "Foreign"


@pytest.mark.parametrize("group", [[], {}, None, "triage"])
def test_invalid_group_returns_400_without_writes(production, group):
    client, workspace, project, original, issue, url = production
    response = client.post(url, {**payload(), "group": group}, format="json")
    assert response.status_code == 400
    assert not IzClickProductionStatus.objects.exists()
    assert_unchanged(original, issue)


def test_failed_binding_rolls_back_new_catalogue_and_native_state(production):
    client, workspace, project, original, issue, url = production
    from django.db import IntegrityError
    with patch.object(IzClickProductionStatusBinding.objects, "create", side_effect=IntegrityError("test conflict")):
        response = client.post(url, payload(), format="json")
    assert response.status_code == 409
    assert not IzClickProductionStatus.objects.exists()
    assert State.objects.filter(project=project).count() == 1
    assert_unchanged(original, issue)


def test_native_project_state_creation_still_works(production):
    client, workspace, project, original, issue, url = production
    native_url = f"/api/workspaces/{workspace.slug}/projects/{project.id}/states/"
    response = client.post(native_url, {"name": "Native review", "color": "#123456", "group": "started"}, format="json")
    assert response.status_code == 200, response.data
    native_id = response.data["id"]
    listing = client.get(native_url)
    assert listing.status_code == 200
    assert any(str(row["id"]) == str(native_id) for row in listing.data)
    assert_unchanged(original, issue)


def test_native_duplicate_keeps_existing_state_and_issue(production):
    client, workspace, project, original, issue, url = production
    native_url = f"/api/workspaces/{workspace.slug}/projects/{project.id}/states/"
    # The endpoint runs in autocommit in production. Keep its handled database
    # error inside a savepoint so pytest's outer transaction remains queryable.
    with transaction.atomic():
        response = client.post(native_url, {"name": "Existente", "color": "#abcdef", "group": "started"}, format="json")
    assert response.status_code == 400, response.data
    assert State.objects.filter(project=project).count() == 1
    assert_unchanged(original, issue)
