"""Seed fictional IZ-Click QA data and short-lived browser sessions.
ONLY run against isolated PostgreSQL database izclick_qa, never production.
"""
import json
import os

from django.conf import settings
from django.contrib.auth import BACKEND_SESSION_KEY, HASH_SESSION_KEY, SESSION_KEY
from plane.db.models import (
    User, Profile, Workspace, WorkspaceMember, Project, ProjectMember,
    State, Issue, IzclickCustomField, IzclickCustomFieldValue,
)
from plane.db.models.session import SessionStore
from plane.license.models import Instance, InstanceAdmin

database_name = settings.DATABASES["default"]["NAME"]
assert database_name == "izclick_qa", f"REFUSING seed for database {database_name!r}"
assert os.environ.get("APP_BASE_URL") == "http://127.0.0.1:38080"
assert settings.DEBUG is False


def qa_session(user):
    session = SessionStore()
    session[SESSION_KEY] = str(user.pk)
    session[BACKEND_SESSION_KEY] = settings.AUTHENTICATION_BACKENDS[0]
    session[HASH_SESSION_KEY] = user.get_session_auth_hash()
    session.save()
    return session.session_key


admin = User.objects.create(
    username="izclick_qa_admin", email="qa-admin@example.invalid",
    is_email_verified=True, is_email_valid=True, is_active=True,
    first_name="QA", last_name="Editor",
)
guest = User.objects.create(
    username="izclick_qa_guest", email="qa-guest@example.invalid",
    is_email_verified=True, is_email_valid=True, is_active=True,
    first_name="QA", last_name="Lector",
)
# Plane's first-run screen is controlled by the instance setup flag, not
# merely the existence of workspace/project fixtures. Set it only in qa DB.
instance = Instance.objects.first()
assert instance is not None, "QA backend must have registered its own instance"
instance.is_setup_done = True
instance.is_signup_screen_visited = True
instance.is_verified = True
instance.is_test = True
instance.is_telemetry_enabled = False
instance.is_support_required = False
instance.save(update_fields=[
    "is_setup_done", "is_signup_screen_visited", "is_verified",
    "is_test", "is_telemetry_enabled", "is_support_required",
])
InstanceAdmin.objects.get_or_create(
    instance=instance, user=admin,
    defaults={"is_verified": True, "role": 20},
)

for actor in (admin, guest):
    profile, _ = Profile.objects.get_or_create(user=actor)
    profile.is_onboarded = True
    profile.onboarding_step = {
        "profile_complete": True,
        "workspace_create": True,
        "workspace_invite": True,
    }
    profile.save()

workspace = Workspace.objects.create(
    name="IZ-Click QA Aislado", slug="izclick-qa", owner=admin,
)
WorkspaceMember.objects.create(workspace=workspace, member=admin, role=20)
WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
project = Project.objects.create(
    name="Activaciones ficticias QA", identifier="QAT", workspace=workspace,
)
ProjectMember.objects.create(workspace=workspace, project=project, member=admin, role=20)
ProjectMember.objects.create(workspace=workspace, project=project, member=guest, role=5)

pending = State.objects.create(
    workspace=workspace, project=project, name="Por ejecutar",
    color="#f59e0b", group="unstarted", default=True,
)
active = State.objects.create(
    workspace=workspace, project=project, name="En ejecución",
    color="#3b82f6", group="started",
)
done = State.objects.create(
    workspace=workspace, project=project, name="Terminada",
    color="#22c55e", group="completed",
)
project.default_state = pending
project.save(update_fields=["default_state"])
states = [pending, pending, active, active, done, done, pending, active]
issues = [
    Issue.objects.create(
        workspace=workspace, project=project, state=state,
        name=(
            "Carga QA montaje con nombre excepcionalmente largo para verificar truncamiento y columnas"
            if index == 0 else f"Carga ficticia de ensayo {index + 1}"
        ),
        priority=["urgent", "high", "medium", "low", "none"][index % 5],
        created_by=admin,
    )
    for index, state in enumerate(states)
]
field = IzclickCustomField(
    project=project, name="Material QA", field_type="text",
    created_by=admin, updated_by=admin,
)
field.full_clean()
field.save(disable_auto_set_user=True)
value = IzclickCustomFieldValue(
    field=field, issue=issues[0], value="Paneles de aluminio",
    created_by=admin, updated_by=admin,
)
value.full_clean()
value.save(disable_auto_set_user=True)

# The generated sessions must not be committed or uploaded as artifacts.
print("IZCLICK_QA_FIXTURE=" + json.dumps({
    "workspace": workspace.slug,
    "project_id": str(project.pk),
    "issue_id": str(issues[0].pk),
    "field_id": str(field.pk),
    "admin_session": qa_session(admin),
    "guest_session": qa_session(guest),
}, separators=(",", ":")))
