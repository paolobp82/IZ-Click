#!/usr/bin/env python3
"""Audit the seven producers identified in the workspace member list; repair missing profiles only."""
import argparse
import datetime
import fcntl
import json
import os
from pathlib import Path
import subprocess

ROOT = Path('/opt/iz-click/plane-app')
WORKSPACE_ID = '36702027-96cf-4309-9532-c4eacee31cfa'
EXPECTED_PRODUCERS = (
    'ayrala@izango.com.pe', 'acastro@izango.com.pe', 'cmosqueira@izango.com.pe',
    'scavero@izango.com.pe', 'kascanio@izango.com.pe', 'dgalvez@izango.com.pe', 'froman@izango.com.pe',
)
MARKER = '__IZCLICK_PRODUCER_ROSTER__'


def repair_in_django(apply=False, *, workspace_id=WORKSPACE_ID, slug='izango', emails=EXPECTED_PRODUCERS):
    from django.db import transaction
    from plane.db.models import Workspace, WorkspaceMember, User, IzclickWorkspaceRole
    with transaction.atomic():
        workspace = Workspace.objects.select_for_update().get(pk=workspace_id, slug=slug)
        pending, roster = [], []
        # Validate the entire requested roster before changing even one record.
        for email in emails:
            users = list(User.objects.filter(email__iexact=email, is_active=True, is_bot=False))
            if len(users) != 1:
                raise RuntimeError('No hay una cuenta activa unica para ' + email)
            user = users[0]
            if not WorkspaceMember.objects.filter(workspace=workspace, member=user, is_active=True).exists():
                raise RuntimeError('La cuenta no es miembro activo del espacio: ' + email)
            roles = list(IzclickWorkspaceRole.objects.select_for_update().filter(workspace=workspace, user=user))
            if len(roles) > 1 or (roles and roles[0].role != 'producer'):
                raise RuntimeError('El perfil existente requiere revision; no se sobrescribe: ' + email)
            roster.append({'email': email, 'user_id': str(user.pk), 'name': user.display_name or user.email,
                           'role': roles[0].role if roles else None})
            if not roles:
                pending.append(user)
        if apply:
            for user in pending:
                role = IzclickWorkspaceRole(workspace=workspace, user=user, role='producer')
                role.save(disable_auto_set_user=True)
            for user in pending:
                if not IzclickWorkspaceRole.objects.filter(workspace=workspace, user=user, role='producer').exists():
                    raise RuntimeError('No se pudo verificar el perfil; se revierte la operacion')
        return {'workspace': slug, 'production_unchanged': not apply or not pending,
                'roster': roster, 'missing_profiles': [user.email for user in pending],
                'profiles_created': len(pending) if apply else 0}


def call_django(apply):
    source = Path(__file__).read_text()
    program = ('import json\nnamespace = {"__name__": "izclick_producer_roster"}\n'
               + 'exec(' + repr(source) + ', namespace)\n'
               + 'result = namespace["repair_in_django"](' + repr(apply) + ')\n'
               + 'print(' + repr(MARKER) + ' + json.dumps(result))\n')
    result = subprocess.run(['docker', 'exec', '-i', 'plane-app-api-1', 'python', 'manage.py', 'shell'],
                            input=program, text=True, capture_output=True)
    lines = [line[len(MARKER):] for line in result.stdout.splitlines() if line.startswith(MARKER)]
    if result.returncode or len(lines) != 1:
        # Django shells may report errors without a failing process exit code.
        raise RuntimeError('No se pudo validar la lista; no continúes con cambios manuales. ' + result.stderr[-1800:])
    return json.loads(lines[0])


def emit(check, **data):
    print(json.dumps({'check': check, **data}), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError('Ejecutar como root o con sudo')
    os.umask(0o077)
    with (ROOT / '.izclick-repair.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        before = call_django(False)
        emit('producer_roster_preflight', **before)
        if not args.apply:
            return
        if not before['missing_profiles']:
            emit('producer_roster_ready', profiles_created=0, refresh_browser=True)
            return
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        directory = ROOT / ('producer-roster-backup-' + stamp)
        directory.mkdir(mode=0o700)
        (directory / 'before.json').write_text(json.dumps(before, indent=2))
        dump = directory / 'database.dump'
        emit('backup_starting', directory=str(directory))
        with dump.open('wb') as stream:
            subprocess.run(['docker', 'exec', 'plane-app-plane-db-1', 'sh', '-c',
                'PGHOST=/var/run/postgresql exec pg_dump -Fc -U "${POSTGRES_USER:-plane}" -d "${POSTGRES_DB:-plane}"'],
                stdout=stream, check=True)
        with dump.open('rb') as stream:
            listing = subprocess.check_output(['docker', 'exec', '-i', 'plane-app-plane-db-1', 'pg_restore', '--list'], stdin=stream)
        if b'TABLE DATA' not in listing:
            raise RuntimeError('Respaldo invalido; no se cambian perfiles')
        emit('backup_ready', archive_valid=True, directory=str(directory))
        after = call_django(True)
        verified = call_django(False)
        if verified['missing_profiles']:
            raise RuntimeError('La lista cambio despues de la correccion; revisar los perfiles')
        (directory / 'after.json').write_text(json.dumps(verified, indent=2))
        emit('producer_roster_repaired', profiles_created=after['profiles_created'],
             producers=verified['roster'], backup=str(directory), refresh_browser=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        emit('repair_stopped', error=type(exc).__name__, reason=str(exc))
        raise SystemExit(1)
