from datetime import timedelta
from django.test import TestCase, override_settings
from django.utils import timezone
from plane.db.models import Issue, State
from plane.tests.test_izclick_issue_intake import IntakeFixture


@override_settings(
    IZCLICK_COORDINATION_ENABLED=True, IZCLICK_COORDINATION_WORKSPACES=[]
)
class NativeTaskPaginationTests(IntakeFixture, TestCase):
    def setUp(self):
        self.prepare()
        self.client.force_authenticate(self.users["coordinator"])
        self.ids = []
        start = timezone.now() - timedelta(days=1)
        for index in range(55):
            issue = Issue.objects.create(
                name=f"Carga {index}",
                project=self.project,
                workspace=self.workspace,
                state=self.state,
            )
            Issue.objects.filter(pk=issue.pk).update(
                created_at=start + timedelta(seconds=index)
            )
            self.ids.append(str(issue.pk))
        Issue.objects.create(
            name="Subtarea",
            parent_id=self.ids[-1],
            project=self.project,
            workspace=self.workspace,
            state=self.state,
        )

    def page(self, page, **filters):
        response = self.client.get(
            self.native,
            {
                "cursor": f"50:{page - 1}:0",
                "per_page": 50,
                "order_by": "-created_at",
                "sub_issue": "false",
                **filters,
            },
        )
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_newest_first_numbered_pages_have_no_overlap_and_exclude_subtasks(self):
        first, second = self.page(1), self.page(2)
        self.assertEqual(first["total_count"], 55)
        self.assertEqual(
            [str(row["id"]) for row in first["results"]], list(reversed(self.ids))[:50]
        )
        self.assertEqual(
            [str(row["id"]) for row in second["results"]], list(reversed(self.ids))[50:]
        )
        self.assertEqual(len(first["results"]), 50)
        self.assertEqual(len(second["results"]), 5)

    def test_state_filter_and_returning_to_first_page_preserve_newest_order(self):
        other = State.objects.create(
            name="En curso",
            group="started",
            project=self.project,
            workspace=self.workspace,
        )
        Issue.objects.filter(pk__in=self.ids[:3]).update(state=other)
        filtered = self.page(1, state=str(other.pk))
        self.assertEqual(filtered["total_count"], 3)
        self.assertEqual(
            [str(row["id"]) for row in filtered["results"]],
            list(reversed(self.ids[:3])),
        )
        self.page(2)
        self.assertEqual(str(self.page(1)["results"][0]["id"]), self.ids[-1])
