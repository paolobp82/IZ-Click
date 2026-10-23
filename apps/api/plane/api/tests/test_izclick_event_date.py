"""Event dates survive queued URL-preview jobs; normal links still get previews."""
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from plane.bgtasks import work_item_link_task as task
from plane.app.views.issue.link import IssueLinkViewSet
from plane.db.models import Issue, IssueLink, Project, ProjectMember, User, Workspace, WorkspaceMember


class IzclickLinkPreviewTests(SimpleTestCase):
    def setUp(self):
        self.link = SimpleNamespace(
            metadata={"izclick_kind": "event-date", "izclick_event_date": "2026-10-23"},
            url="https://example.invalid/task", save=Mock(),
        )
        self.objects = Mock()
        self.objects.get.return_value = self.link
        self.objects.select_for_update.return_value.get.return_value = self.link

    def run_task(self, url=None, preview=None):
        with patch.object(task.IssueLink, "objects", self.objects), \
             patch.object(task.transaction, "atomic", side_effect=lambda: nullcontext()), \
             patch.object(task, "crawl_work_item_link_title_and_favicon", side_effect=preview) as crawler:
            task.crawl_work_item_link_title.run("test-id", url or self.link.url)
        return crawler

    def test_queued_job_preserves_event_date_without_network(self):
        before = self.link.metadata.copy()
        crawler = self.run_task()
        crawler.assert_not_called()
        self.link.save.assert_not_called()
        self.assertEqual(self.link.metadata, before)

    def test_sig_business_fields_are_also_preserved(self):
        self.link.metadata = {"izclick_kind": "sig-project", "izclick_sig_code": "IZ-42"}
        self.run_task().assert_not_called()
        self.link.save.assert_not_called()

    def test_ordinary_links_keep_existing_metadata_and_gain_preview(self):
        self.link.metadata = {"external_reference": "keep"}
        self.run_task(preview=lambda _: {"title": "Website", "favicon": "icon"})
        self.assertEqual(self.link.metadata, {"external_reference": "keep", "title": "Website", "favicon": "icon"})
        self.link.save.assert_called_once_with(update_fields=["metadata", "updated_at"])

    def test_malformed_kind_does_not_break_ordinary_links(self):
        self.link.metadata = {"izclick_kind": ["external"]}
        self.run_task(preview=lambda _: {"title": "Website"})
        self.assertEqual(self.link.metadata["title"], "Website")

    def test_legacy_non_dictionary_metadata_gets_preview(self):
        self.link.metadata = None
        self.run_task(preview=lambda _: {"title": "Website"})
        self.assertEqual(self.link.metadata, {"title": "Website"})

    def test_link_converted_to_event_during_fetch_is_not_overwritten(self):
        self.link.metadata = {}
        def fetch(_):
            self.link.metadata = {"izclick_kind": "event-date", "izclick_event_date": "2026-11-01"}
            return {"title": "Website"}
        self.run_task(preview=fetch)
        self.assertEqual(self.link.metadata["izclick_event_date"], "2026-11-01")
        self.link.save.assert_not_called()

    def test_stale_url_jobs_do_not_fetch(self):
        self.link.metadata = {}
        self.run_task(url="https://example.invalid/old").assert_not_called()

    def test_url_changed_during_fetch_is_not_overwritten(self):
        self.link.metadata = {"keep": True}
        def fetch(_):
            self.link.url = "https://example.invalid/changed"
            return {"title": "Old website"}
        self.run_task(preview=fetch)
        self.link.save.assert_not_called()
        self.assertEqual(self.link.metadata, {"keep": True})

    def test_deleted_link_is_ignored(self):
        self.objects.get.side_effect = IssueLink.DoesNotExist
        self.run_task().assert_not_called()

    def test_link_deleted_during_fetch_is_ignored(self):
        self.link.metadata = {}
        self.objects.select_for_update.return_value.get.side_effect = IssueLink.DoesNotExist
        self.run_task(preview=lambda _: {"title": "Website"})
        self.link.save.assert_not_called()


@override_settings(APP_BASE_URL="https://qa.invalid", WEB_URL="https://qa.invalid")
class IzclickEventDateEndpointTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create(username="event-editor", email="event-editor@example.invalid")
        cls.workspace = Workspace.objects.create(name="Event Tests", slug="event-tests", owner=cls.user)
        WorkspaceMember.objects.create(workspace=cls.workspace, member=cls.user, role=20)
        cls.project = Project.objects.create(name="Events", identifier="EVT", workspace=cls.workspace)
        ProjectMember.objects.create(workspace=cls.workspace, project=cls.project, member=cls.user, role=20)
        cls.issue = Issue.objects.create(name="Montaje", workspace=cls.workspace, project=cls.project, sequence_id=1)

    def request(self, method, action, data=None, pk=None):
        factory = APIRequestFactory()
        request = getattr(factory, method)("/api/test/", data=data, format="json")
        force_authenticate(request, user=self.user)
        kwargs = {"slug": self.workspace.slug, "project_id": self.project.id, "issue_id": self.issue.id}
        if pk:
            kwargs["pk"] = pk
        return IssueLinkViewSet.as_view({method: action})(request, **kwargs)

    @patch("plane.app.views.issue.link.issue_activity.delay")
    @patch("plane.app.views.issue.link.crawl_work_item_link_title.delay")
    @patch.object(task, "crawl_work_item_link_title_and_favicon")
    def test_create_edit_reload_and_delete_event_date(self, crawler, enqueue, activity):
        payload = {"title": "IZ-Click | Fecha de realización del evento", "url": "https://example.invalid/task#event", "metadata": {"izclick_kind": "event-date", "izclick_event_date": "2026-10-23"}}
        created = self.request("post", "create", payload)
        self.assertEqual(created.status_code, 201, created.data)
        link_id = created.data["id"]
        enqueue.assert_not_called()
        # An old job may already exist in the queue: it must also be harmless.
        task.crawl_work_item_link_title.run(str(link_id), payload["url"])
        self.assertEqual(IssueLink.objects.get(id=link_id).metadata, payload["metadata"])
        changed = self.request("patch", "partial_update", {"metadata": {"izclick_kind": "event-date", "izclick_event_date": "2026-11-02"}}, pk=link_id)
        self.assertEqual(changed.status_code, 200, changed.data)
        enqueue.assert_not_called()
        listed = self.request("get", "list")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data[0]["metadata"]["izclick_event_date"], "2026-11-02")
        self.assertEqual(self.request("delete", "destroy", pk=link_id).status_code, 204)
        self.assertFalse(IssueLink.objects.filter(id=link_id).exists())
        crawler.assert_not_called()
