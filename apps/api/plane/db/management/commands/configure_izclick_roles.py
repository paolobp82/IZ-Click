# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Apply only an explicitly verified UUID/email business-role manifest."""

import json
from pathlib import Path
from uuid import UUID

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from plane.db.models import Workspace, WorkspaceMember, IzclickWorkspaceRole


class Command(BaseCommand):
    help = "Validate a UUID/email/role manifest; writes only with --apply. Does not send notifications."

    def add_arguments(self, parser):
        parser.add_argument("workspace_slug")
        parser.add_argument("manifest", help="JSON array of {user_id, email, role}; verified IDs only")
        parser.add_argument("--apply", action="store_true")

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            workspace = Workspace.objects.get(slug=options["workspace_slug"])
            entries = json.loads(Path(options["manifest"]).read_text(encoding="utf-8"))
            if not isinstance(entries, list) or not entries:
                raise ValueError("Expected a nonempty JSON array")
            verified = []
            seen = set()
            for entry in entries:
                user_id = UUID(entry["user_id"])
                if user_id in seen or entry["role"] not in IzclickWorkspaceRole.Role.values:
                    raise ValueError("Duplicate user or invalid business role")
                seen.add(user_id)
                member = WorkspaceMember.objects.select_related("member").get(
                    workspace=workspace,
                    member_id=user_id,
                    is_active=True,
                    member__is_active=True,
                    member__is_bot=False,
                )
                if member.member.email.casefold() != entry["email"].casefold():
                    raise ValueError("UUID/email identity mismatch")
                verified.append((member.member, entry["role"]))
            # Validate every row before the first write; never infer roles from names.
            for user, role in verified:
                if options["apply"]:
                    from plane.utils.izclick_roles import set_business_role

                    set_business_role(workspace=workspace, user=user, role=role)
                self.stdout.write(f"{user.pk} {user.email}: {role}")
            self.stdout.write(
                self.style.SUCCESS(
                    f"{'Applied' if options['apply'] else 'Validated (dry run)'} {len(verified)} verified roles"
                )
            )
        except (OSError, ValueError, KeyError, TypeError, Workspace.DoesNotExist, WorkspaceMember.DoesNotExist) as exc:
            raise CommandError(str(exc)) from exc
