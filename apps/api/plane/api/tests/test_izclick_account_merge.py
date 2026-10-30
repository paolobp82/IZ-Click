"""Consolidation tested on actual Plane models and PostgreSQL, not production data."""
from datetime import timedelta
import importlib.util
from pathlib import Path
from unittest.mock import patch
from uuid import UUID, uuid4

from django.db import IntegrityError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.response import Response
from plane.db.models import (
    User, Workspace, WorkspaceMember, Project, ProjectMember, Profile, State,
    Issue, IssueAssignee, IssueComment, Page, FileAsset, Session, APIToken,
    Device, DeviceSession, UserFavorite, Account, IzclickCustomField,
    IzclickCustomFieldValue,
)

spec = importlib.util.spec_from_file_location("angelica_merge", Path(__file__).resolve().parents[5] / "ops/izclick-merge-angelica.py")
merge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(merge)


@override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}})
class AccountMergeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.source = User.objects.create_user(email=merge.SOURCE, username="merge-source", password="fixture-only-source")
        cls.target = User.objects.create_user(id=UUID(merge.TARGET_ID), email=merge.TARGET, username="merge-target", password="fixture-only-target")
        cls.other = User.objects.create_user(email="other@example.invalid", username="merge-other")
        cls.personal = Workspace.objects.create(name="Angelica", slug=merge.SOURCE_SLUG, owner=cls.source,
                                                 created_by=cls.source, updated_by=cls.source, )
        # Model.save() derives audit users from the request; set exact fixture
        # actors directly, as the administrative merger will do.
        Workspace.objects.filter(pk=cls.personal.pk).update(created_by=cls.source, updated_by=cls.source)
        cls.izango = Workspace.objects.create(name="Izango", slug=merge.TARGET_SLUG, owner=cls.target)
        cls.src_member = WorkspaceMember.objects.create(workspace=cls.personal, member=cls.source, role=20)
        cls.dst_member = WorkspaceMember.objects.create(workspace=cls.izango, member=cls.target, role=20)
        cls.personal_project = Project.objects.create(workspace=cls.personal, name="Personal", identifier="PERS")
        cls.main_project = Project.objects.create(workspace=cls.izango, name="Cotizaciones Izango", identifier="IZANG")
        cls.src_project_member = ProjectMember.objects.create(workspace=cls.personal, project=cls.personal_project,
                                                               member=cls.source, role=20)
        cls.dst_project_member = ProjectMember.objects.create(workspace=cls.izango, project=cls.main_project,
                                                               member=cls.target, role=20)
        cls.profile = Profile.objects.create(user=cls.target, last_workspace_id=cls.personal.pk)
        Profile.objects.create(user=cls.source, last_workspace_id=cls.personal.pk)
        state = State.objects.create(workspace=cls.personal, project=cls.personal_project,
                                     name="Pendiente", group="backlog", color="#112233")
        cls.issue = Issue.objects.create(workspace=cls.personal, project=cls.personal_project, state=state,
                                         name="Contenido de la cuenta duplicada")
        Issue.objects.filter(pk=cls.issue.pk).update(created_by=cls.source, updated_by=cls.source)
        cls.assignee = IssueAssignee.objects.create(workspace=cls.personal, project=cls.personal_project,
                                                    issue=cls.issue, assignee=cls.source)
        cls.comment = IssueComment.objects.create(workspace=cls.personal, project=cls.personal_project,
                                                  issue=cls.issue, actor=cls.source, comment_html="<p>Conservar</p>")
        cls.page = Page.objects.create(workspace=cls.personal, owned_by=cls.source, name="Página personal")
        cls.asset = FileAsset.objects.create(workspace=cls.personal, project=cls.personal_project,
                                             issue=cls.issue, user=cls.source, asset="fixture/keep.pdf",
                                             attributes={"name": "keep.pdf"}, is_uploaded=True)
        cls.custom = IzclickCustomField.objects.create(project=cls.personal_project, name="Comercial asignado", field_type="member")
        cls.value = IzclickCustomFieldValue.objects.create(field=cls.custom, issue=cls.issue, value=str(cls.source.pk))
        text = IzclickCustomField.objects.create(project=cls.personal_project, name="Texto", field_type="text")
        cls.text_value = IzclickCustomFieldValue.objects.create(field=text, issue=cls.issue, value=str(cls.source.pk))
        cls.src_session = Session.objects.create(session_key="fictional-source-session", user_id=str(cls.source.pk),
                                                  session_data="fictional", expire_date=timezone.now() + timedelta(days=2))
        cls.dst_session = Session.objects.create(session_key="fictional-target-session", user_id=str(cls.target.pk),
                                                  session_data="fictional", expire_date=timezone.now() + timedelta(days=2))
        cls.token = APIToken.objects.create(user=cls.source, workspace=cls.personal)
        cls.device = Device.objects.create(user=cls.source, device_type="WEB")
        cls.device_session = DeviceSession.objects.create(device=cls.device, session=cls.src_session)

    def assert_original(self):
        self.source.refresh_from_db(); self.personal.refresh_from_db(); self.issue.refresh_from_db()
        self.src_member.refresh_from_db(); self.token.refresh_from_db(); self.device.refresh_from_db()
        self.assertTrue(self.source.is_active)
        self.assertEqual(self.personal.owner_id, self.source.pk)
        self.assertEqual(self.issue.created_by_id, self.source.pk)
        self.assertEqual(self.src_member.member_id, self.source.pk)
        self.assertTrue(self.token.is_active)
        self.assertTrue(self.device.is_active)

    def test_preflight_is_read_only(self):
        result = merge.merge_accounts()
        self.assertEqual(result["check"], "merge_preflight")
        self.assertTrue(result["production_unchanged"])
        self.assertGreater(len(result["plan"]["relations"]), 0)
        self.assert_original()
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.last_workspace_id, self.personal.pk)

    def test_moves_real_content_access_and_member_values_preserving_ids_password_and_other_users(self):
        password = self.target.password
        before = {m: set(m._base_manager.values_list("pk", flat=True)) for m in [
            User, Workspace, Project, WorkspaceMember, ProjectMember, Issue, IssueAssignee,
            IssueComment, Page, FileAsset, Profile, Session, APIToken, Device]}
        result = merge.merge_accounts(apply=True)
        self.assertEqual(result["check"], "accounts_merged")
        self.assertEqual(result["visible_workspaces"], ["angelica", "izango"])
        for model, ids in before.items():
            self.assertEqual(set(model._base_manager.values_list("pk", flat=True)), ids)
        self.target.refresh_from_db(); self.source.refresh_from_db(); self.personal.refresh_from_db()
        self.assertEqual(self.target.password, password)
        self.assertTrue(self.target.check_password("fixture-only-target"))
        self.assertFalse(self.source.is_active)
        self.assertEqual(self.personal.owner_id, self.target.pk)
        for obj, field in [(self.src_member, "member_id"), (self.src_project_member, "member_id"),
                           (self.issue, "created_by_id"), (self.assignee, "assignee_id"),
                           (self.comment, "actor_id"), (self.page, "owned_by_id"), (self.asset, "user_id")]:
            obj.refresh_from_db()
            self.assertEqual(getattr(obj, field), self.target.pk)
        self.asset.refresh_from_db()
        self.assertEqual(self.asset.asset.name, "fixture/keep.pdf")
        self.value.refresh_from_db(); self.text_value.refresh_from_db()
        self.assertEqual(self.value.value, str(self.target.pk))
        self.assertEqual(self.text_value.value, str(self.source.pk), "Free text must never be rewritten")
        self.dst_project_member.refresh_from_db(); self.dst_member.refresh_from_db()
        self.assertEqual(self.dst_project_member.role, 20)
        self.assertEqual(self.dst_member.member_id, self.target.pk)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.last_workspace_id, self.izango.pk)
        self.other.refresh_from_db()
        self.assertTrue(self.other.is_active)

    def test_expires_source_sessions_tokens_and_devices_without_transferring_credentials(self):
        target_expiry = self.dst_session.expire_date
        merge.merge_accounts(apply=True)
        for obj in [self.src_session, self.dst_session, self.token, self.device, self.device_session]: obj.refresh_from_db()
        self.assertLessEqual(self.src_session.expire_date, timezone.now())
        self.assertEqual(self.dst_session.expire_date, target_expiry)
        self.assertEqual(self.token.user_id, self.source.pk)
        self.assertFalse(self.token.is_active)
        self.assertFalse(self.device.is_active)
        self.assertFalse(self.device_session.is_active)
        self.assertEqual(Profile.objects.get(user=self.source).user_id, self.source.pk)

    def test_repeat_is_idempotent(self):
        merge.merge_accounts(apply=True)
        self.assertEqual(merge.merge_accounts(apply=True)["check"], "already_merged")

    def test_existing_membership_overlap_stops_without_deleting_or_escalating(self):
        WorkspaceMember.objects.create(workspace=self.personal, member=self.target, role=5)
        with self.assertRaisesRegex(merge.MergeStopped, "overlapping"):
            merge.merge_accounts(apply=True)
        self.assert_original()
        self.assertEqual(WorkspaceMember.objects.get(workspace=self.personal, member=self.target).role, 5)

    def test_unexpected_unique_constraint_rolls_everything_back(self):
        entity = uuid4()
        for user, workspace in [(self.source, self.personal), (self.target, self.izango)]:
            UserFavorite.objects.create(user=user, workspace=workspace, entity_type="issue", entity_identifier=entity)
        with self.assertRaises(IntegrityError):
            merge.merge_accounts(apply=True)
        self.assert_original()
        self.assertEqual(UserFavorite.objects.count(), 2)

    def test_failure_in_final_selector_validation_rolls_back_content_and_auth_changes(self):
        with patch("plane.app.views.workspace.base.UserWorkSpacesEndpoint.as_view", return_value=lambda request: Response(status=500)):
            with self.assertRaisesRegex(merge.MergeStopped, "selector"):
                merge.merge_accounts(apply=True)
        self.assert_original()
        self.src_session.refresh_from_db()
        self.assertGreater(self.src_session.expire_date, timezone.now())

    def test_source_global_privileges_are_never_transferred(self):
        User.objects.filter(pk=self.source.pk).update(is_staff=True)
        with self.assertRaisesRegex(merge.MergeStopped, "privileges"):
            merge.merge_accounts(apply=True)
        self.assert_original()

    def test_social_credentials_require_separate_handling(self):
        Account.objects.create(user=self.source, provider="google", provider_account_id="fixture-only", access_token="fixture-only")
        with self.assertRaisesRegex(merge.MergeStopped, "social login"):
            merge.merge_accounts(apply=True)
        self.assert_original()

    def test_changed_plan_is_rejected_before_writes(self):
        plan = merge.merge_accounts()["plan"]
        Issue.objects.create(workspace=self.personal, project=self.personal_project,
                             state=self.issue.state, name="Cambio concurrente")
        Issue.objects.filter(name="Cambio concurrente").update(created_by=self.source)
        with self.assertRaisesRegex(merge.MergeStopped, "reviewed preflight"):
            merge.merge_accounts(apply=True, expected_plan=plan)
        self.assert_original()
