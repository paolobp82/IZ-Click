import importlib.util
from pathlib import Path
from uuid import uuid4
from django.test import TestCase
from plane.db.models import User, Workspace, WorkspaceMember, IzclickWorkspaceRole

spec = importlib.util.spec_from_file_location('roster_repair', Path(__file__).resolve().parents[4] / 'ops/izclick-producer-roster-repair.py')
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)


class ProducerRosterRepairTests(TestCase):
    def setUp(self):
        self.users = [User.objects.create(email=f'{name}-{uuid4()}@example.test', username=str(uuid4()))
            for name in ['new-producer', 'existing-producer', 'commercial']]
        self.workspace = Workspace.objects.create(name='Agency', slug='roster-agency', owner=self.users[0])
        for user in self.users:
            WorkspaceMember.objects.create(workspace=self.workspace, member=user, role=15)
        IzclickWorkspaceRole.objects.create(workspace=self.workspace, user=self.users[1], role='producer')
        IzclickWorkspaceRole.objects.create(workspace=self.workspace, user=self.users[2], role='commercial')

    def attempt(self, apply=False, users=None):
        return repair.repair_in_django(apply, workspace_id=self.workspace.pk, slug=self.workspace.slug,
            emails=[user.email for user in (users if users is not None else self.users[:2])])

    def test_audit_is_read_only_and_apply_repairs_only_missing_profiles_idempotently(self):
        result = self.attempt()
        self.assertEqual(result['missing_profiles'], [self.users[0].email])
        self.assertEqual(IzclickWorkspaceRole.objects.count(), 2)
        existing = list(IzclickWorkspaceRole.objects.values_list('pk', flat=True))
        result = self.attempt(True)
        self.assertEqual(result['profiles_created'], 1)
        self.assertEqual(self.attempt(True)['profiles_created'], 0)
        self.assertTrue(all(IzclickWorkspaceRole.objects.filter(pk=pk).exists() for pk in existing))
        self.assertEqual(IzclickWorkspaceRole.objects.get(user=self.users[2]).role, 'commercial')

    def test_role_conflict_is_detected_before_any_profile_is_created(self):
        with self.assertRaisesRegex(RuntimeError, 'no se sobrescribe'):
            self.attempt(True, self.users)
        self.assertFalse(IzclickWorkspaceRole.objects.filter(user=self.users[0]).exists())

    def test_inactive_membership_is_never_reactivated_or_promoted(self):
        WorkspaceMember.objects.filter(member=self.users[0]).update(is_active=False)
        with self.assertRaisesRegex(RuntimeError, 'miembro activo'):
            self.attempt(True)
        self.assertFalse(IzclickWorkspaceRole.objects.filter(user=self.users[0]).exists())
