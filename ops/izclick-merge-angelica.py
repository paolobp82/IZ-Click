#!/usr/bin/env python3
"""One-time, transactional consolidation of Angelica's duplicate identity.

Run on the production host with sudo. Default is a read-only inventory.
--apply first validates a private PostgreSQL backup, then moves content/access
to the .com.pe identity. It never deletes users, content, or memberships.
"""
import argparse
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import subprocess

SOURCE = "aestupinan@izango.com"
TARGET = "aestupinan@izango.com.pe"
TARGET_ID = "0e43d353-52c9-4375-b55d-01cedb982969"
SOURCE_SLUG = "angelica"
TARGET_SLUG = "izango"
ROOT = Path("/opt/iz-click/plane-app")
MARKER = "IZCLICK_MERGE_JSON="
# Keep authentication material and account-wide preferences on their original
# identities. They must never silently become credentials for the target user.
RETAIN = {"db.user", "db.profile", "db.account", "db.socialloginconnection",
          "db.apitoken", "db.apiactivitylog", "db.device", "db.devicesession",
          "db.session", "db.usernotificationpreference", "db.emailnotificationlog"}


class MergeStopped(Exception):
    pass


def user_references(source):
    from django.apps import apps
    from django.contrib.auth import get_user_model
    User = get_user_model()
    moves = []
    for model in sorted(apps.get_models(include_auto_created=True), key=lambda m: m._meta.label_lower):
        label = model._meta.label_lower
        if label in RETAIN:
            continue
        for field in model._meta.concrete_fields:
            if not field.is_relation or field.remote_field.model is not User:
                continue
            count = model._base_manager.filter(**{field.attname: source.pk}).count()
            if not count:
                continue
            # Instance administrators, auth groups and third-party integrations
            # require explicit handling, rather than inheriting their privileges.
            if model._meta.app_label != "db" or model._meta.auto_created:
                raise MergeStopped("Unsupported user relation: " + label + "." + field.name)
            moves.append((model, field, count))
    return moves


def build_plan():
    from django.contrib.auth import get_user_model
    from plane.db.models import (Workspace, WorkspaceMember, ProjectMember,
                                 Profile, Account, SocialLoginConnection,
                                 IzclickCustomFieldValue)
    User = get_user_model()
    source = User.objects.get(email__iexact=SOURCE)
    target = User.objects.get(email__iexact=TARGET)
    if str(target.pk) != TARGET_ID:
        raise MergeStopped("The destination user ID differs from the verified account")
    if source.pk == target.pk or not target.is_active or target.is_bot:
        raise MergeStopped("The destination identity is not an active human account")
    if source.is_staff or source.is_superuser or source.is_bot:
        raise MergeStopped("The source has instance-level privileges or is a bot")
    if not WorkspaceMember.objects.filter(workspace__slug=TARGET_SLUG, member=target,
                                           role=20, is_active=True).exists():
        raise MergeStopped("The destination's existing Izango admin membership changed")
    if not Profile.objects.filter(user=target).exists():
        raise MergeStopped("The destination profile is missing")
    if Account.objects.filter(user=source).exists() or SocialLoginConnection.objects.filter(user=source).exists():
        raise MergeStopped("Source has social login credentials; a separate migration is required")
    source_ws = Workspace.objects.get(slug=SOURCE_SLUG)
    moves = user_references(source)
    member_values = IzclickCustomFieldValue._base_manager.filter(
        field__field_type="member", value=str(source.pk)).count()
    already = not source.is_active and source_ws.owner_id == target.pk and not moves and not member_values
    if not already and source_ws.owner_id != source.pk:
        raise MergeStopped("The Angelica workspace owner changed")
    source_spaces = set(WorkspaceMember._base_manager.filter(member=source).values_list("workspace_id", flat=True))
    target_spaces = set(WorkspaceMember._base_manager.filter(member=target).values_list("workspace_id", flat=True))
    source_projects = set(ProjectMember._base_manager.filter(member=source).values_list("project_id", flat=True))
    target_projects = set(ProjectMember._base_manager.filter(member=target).values_list("project_id", flat=True))
    if source_spaces & target_spaces or source_projects & target_projects:
        raise MergeStopped("Accounts have overlapping memberships; no automatic deduplication is permitted")
    public_plan = {
        "source": SOURCE, "target": TARGET, "source_id": str(source.pk), "target_id": str(target.pk),
        "already_merged": already,
        "source_workspaces": list(WorkspaceMember.objects.filter(member=source).values(
            "workspace__slug", "role", "is_active")),
        "destination_workspaces": list(WorkspaceMember.objects.filter(member=target).values(
            "workspace__slug", "role", "is_active")),
        "relations": [{"model": m._meta.label_lower, "field": f.name, "count": n} for m, f, n in moves],
        "member_field_values": member_values,
        "preserve_target_password": True, "preserve_record_ids": True,
    }
    return source, target, moves, public_plan


def merge_accounts(apply=False, expected_plan=None):
    from django.apps import apps
    from django.contrib.auth import get_user_model
    from django.db import connection, transaction
    from django.utils import timezone as dj_timezone
    from plane.db.models import (Workspace, WorkspaceMember, ProjectMember, Profile,
                                 Session, APIToken, Device, DeviceSession,
                                 IzclickCustomFieldValue)
    from rest_framework.test import APIRequestFactory, force_authenticate
    from plane.app.views.workspace.base import UserWorkSpacesEndpoint

    source, target, moves, plan = build_plan()
    if expected_plan is not None and plan != expected_plan:
        raise MergeStopped("Account data changed since the reviewed preflight")
    if plan["already_merged"]:
        return {"check": "already_merged", "plan": plan}
    if not apply:
        return {"check": "merge_preflight", "production_unchanged": True, "plan": plan}
    with transaction.atomic():
        # This task modifies existing identities only; no sign-in bypass, new
        # account, token or password is created. Lock identities consistently.
        User = get_user_model()
        list(User.objects.select_for_update().filter(pk__in=[source.pk, target.pk]).order_by("pk"))
        source, target, moves, locked_plan = build_plan()
        if locked_plan != plan:
            raise MergeStopped("Account data changed after inventory; retry from preflight")
        original_password = target.password
        original_memberships = {
            "workspaces": list(WorkspaceMember._base_manager.filter(member=target).values(
                "id", "workspace_id", "role", "is_active", "deleted_at")),
            "projects": list(ProjectMember._base_manager.filter(member=target).values(
                "id", "project_id", "role", "is_active", "deleted_at")),
        }
        journal = []
        for model, field, expected in moves:
            rows = model._base_manager.filter(**{field.attname: source.pk})
            ids = list(rows.values_list("pk", flat=True))
            if len(ids) != expected:
                raise MergeStopped("Related data changed during consolidation")
            changed = rows.update(**{field.attname: target.pk})
            if changed != expected:
                raise MergeStopped("Unexpected number of updated references")
            journal.append({"model": model._meta.label_lower, "field": field.name, "ids": ids})
        member_rows = IzclickCustomFieldValue._base_manager.filter(field__field_type="member", value=str(source.pk))
        member_ids = list(member_rows.values_list("pk", flat=True))
        member_rows.update(value=str(target.pk))
        now = dj_timezone.now()
        # Invalidate the duplicate's existing authentication. Keep all rows and
        # the target's password/session credentials unchanged.
        User.objects.filter(pk=source.pk).update(is_active=False, updated_at=now)
        Session.objects.filter(user_id=str(source.pk), expire_date__gt=now).update(expire_date=now)
        APIToken._base_manager.filter(user=source).update(is_active=False)
        DeviceSession._base_manager.filter(device__user=source).update(is_active=False, end_time=now)
        Device._base_manager.filter(user=source).update(is_active=False)
        profile = Profile.objects.get(user=target)
        old_last_workspace = profile.last_workspace_id
        profile.last_workspace_id = Workspace.objects.get(slug=TARGET_SLUG).pk
        Profile.objects.filter(pk=profile.pk).update(last_workspace_id=profile.last_workspace_id)
        # Force deferred constraints to be checked before success is reported.
        if connection.vendor == "postgresql":
            with connection.cursor() as cursor:
                cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        if user_references(source) or IzclickCustomFieldValue._base_manager.filter(
                field__field_type="member", value=str(source.pk)).exists():
            raise MergeStopped("Some content references remain on the duplicate identity")
        target.refresh_from_db()
        source.refresh_from_db()
        if source.is_active or target.password != original_password or not target.is_active:
            raise MergeStopped("Identity verification failed")
        after_memberships = {
            "workspaces": list(WorkspaceMember._base_manager.filter(
                pk__in=[r["id"] for r in original_memberships["workspaces"]]).values(
                "id", "workspace_id", "role", "is_active", "deleted_at")),
            "projects": list(ProjectMember._base_manager.filter(
                pk__in=[r["id"] for r in original_memberships["projects"]]).values(
                "id", "project_id", "role", "is_active", "deleted_at")),
        }
        # Ordering is model-defined and stable, but compare keyed records too.
        for kind in original_memberships:
            before = {str(r["id"]): r for r in original_memberships[kind]}
            after = {str(r["id"]): r for r in after_memberships[kind]}
            if before != after:
                raise MergeStopped("Destination access changed unexpectedly")
        for entry in journal:
            model = apps.get_model(entry["model"])
            if model._base_manager.filter(pk__in=entry["ids"]).count() != len(entry["ids"]):
                raise MergeStopped("An affected record is missing; transaction rolled back")
        request = APIRequestFactory().get("/api/users/me/workspaces/", HTTP_HOST="izclick.izango.com.pe")
        force_authenticate(request, user=target)
        response = UserWorkSpacesEndpoint.as_view()(request)
        if response.status_code != 200:
            raise MergeStopped("The workspace selector API did not validate")
        slugs = {row["slug"] for row in response.data}
        if not {SOURCE_SLUG, TARGET_SLUG}.issubset(slugs):
            raise MergeStopped("The unified account cannot list both expected workspaces")
        if not Workspace.objects.filter(slug=SOURCE_SLUG, owner=target).exists():
            raise MergeStopped("Workspace ownership verification failed")
        return {"check": "accounts_merged", "login": TARGET, "disabled_login": SOURCE,
                "visible_workspaces": sorted(slugs), "records_preserved": True,
                "password_preserved": True, "plan": plan,
                "journal": journal, "member_field_ids": member_ids,
                "previous_last_workspace": old_last_workspace}


def run_in_django(apply=False, expected_plan=None):
    try:
        result = merge_accounts(apply=apply, expected_plan=expected_plan)
    except MergeStopped as exc:
        result = {"check": "merge_stopped", "reason": str(exc), "transaction_committed": False}
    except Exception as exc:
        # Database exceptions can contain private row values. Report their type,
        # never raw SQL, session data, passwords or integration secrets.
        result = {"check": "merge_stopped", "error": type(exc).__name__, "transaction_committed": False}
    print(MARKER + json.dumps(result, default=str), flush=True)


def report(check, **data):
    print(json.dumps({"check": check, **data}), flush=True)


def command(argv, *, source=None, output=None, timeout=180):
    result = subprocess.run(argv, input=source, stdout=output or subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=timeout)
    if result.returncode:
        raise MergeStopped("Administrative operation failed: " + argv[0])
    return result.stdout


def private_json(path, data):
    with open(path, "x", encoding="utf-8", opener=lambda p, flags: os.open(p, flags, 0o600)) as handle:
        json.dump(data, handle, default=str, indent=2)


def execute(container_id, apply=False, expected_plan=None):
    code = Path(__file__).read_text()
    payload = "ns = {'__name__': 'izclick_merge'}\nexec(%r, ns)\nns['run_in_django'](apply=%r, expected_plan=%r)\n" % (code, apply, expected_plan)
    raw = command(["docker", "exec", "-i", container_id, "python", "manage.py", "shell"], source=payload.encode())
    records = [line[len(MARKER):] for line in raw.decode().splitlines() if line.startswith(MARKER)]
    if len(records) != 1:
        raise MergeStopped("The administrative result could not be verified")
    return json.loads(records[0])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    apply_started = False
    final_result = None
    backup = None
    try:
        if os.geteuid() != 0 or not ROOT.is_dir():
            raise MergeStopped("Run with sudo on the IZCLICK host")
        with open(ROOT / ".izclick-repair.lock", "a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            api = json.loads(command(["docker", "inspect", "plane-app-api-1"]))[0]
            if not api["State"]["Running"]:
                raise MergeStopped("The API container is not running")
            preflight = execute(api["Id"])
            report(preflight["check"], **{k: v for k, v in preflight.items() if k != "check"})
            if preflight["check"] in {"merge_stopped", "already_merged"} or not args.apply:
                return 1 if preflight["check"] == "merge_stopped" else 0
            backup = ROOT / ("angelica-merge-backup-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
            backup.mkdir(mode=0o700)
            private_json(backup / "plan.json", preflight)
            report("backup_starting", directory=str(backup))
            with open(backup / "database.dump", "xb") as archive:
                command(["docker", "exec", "plane-app-plane-db-1", "sh", "-c",
                         'db_user="$POSTGRES_USER"; db_name="$POSTGRES_DB"; test -n "$db_user" || db_user=plane; test -n "$db_name" || db_name=plane; PGHOST=/var/run/postgresql exec pg_dump -Fc -U "$db_user" -d "$db_name"'],
                        output=archive, timeout=600)
            with open(backup / "database.dump", "rb") as archive:
                result = subprocess.run(["docker", "exec", "-i", "plane-app-plane-db-1", "pg_restore", "--list"],
                                        stdin=archive, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
            if result.returncode or b"TABLE DATA" not in result.stdout:
                raise MergeStopped("The database backup archive is not valid")
            report("backup_ready", directory=str(backup), archive_valid=True)
            current = json.loads(command(["docker", "inspect", "plane-app-api-1"]))[0]
            if current["Id"] != api["Id"] or not current["State"]["Running"]:
                raise MergeStopped("The API changed during backup")
            apply_started = True
            result = execute(api["Id"], apply=True, expected_plan=preflight["plan"])
            final_result = result
            private_json(backup / "result.json", result)
            # Keep the detailed restoration journal private on the server.
            report(result["check"], **{k: v for k, v in result.items() if k not in {
                "check", "journal", "member_field_ids", "plan", "previous_last_workspace"}}, backup=str(backup))
            return 0 if result["check"] in {"accounts_merged", "already_merged"} else 1
    except Exception as exc:
        reason = str(exc) if isinstance(exc, MergeStopped) else type(exc).__name__
        if final_result and final_result["check"] == "accounts_merged":
            report("accounts_merged", login=TARGET, disabled_login=SOURCE,
                   audit_saved=False, backup=str(backup), reporting_error=reason)
            return 0
        if apply_started and final_result is None:
            report("merge_status_unknown", reason=reason, backup=str(backup),
                   next_step="Run without --apply to verify status before retrying")
        else:
            report("merge_stopped", reason=reason)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
