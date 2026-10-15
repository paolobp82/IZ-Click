"""Database-backed custom field persistence checks on isolated test PostgreSQL."""
from django.test import TestCase
from django.core.exceptions import ValidationError
from plane.db.models import (
    IzclickCustomField, IzclickCustomFieldValue, Issue, Project, Workspace, User,
)


class IzclickCustomFieldPersistenceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create(username="izclick_field_test_user", email="izclick-test@example.invalid")
        cls.workspace = Workspace.objects.create(
            name="IZ-Click Field Tests", slug="izclick-field-test", owner=cls.user,
        )
        cls.project = Project.objects.create(
            name="Montajes", identifier="MON", workspace=cls.workspace,
        )
        cls.issue = Issue.objects.create(
            name="Tarea prueba de campo", project=cls.project, workspace=cls.workspace,
            sequence_id=1,
        )

    def test_save_and_reload_text_value(self):
        field = IzclickCustomField.objects.create(project=self.project, name="Orden de montaje", field_type="text")
        item = IzclickCustomFieldValue(field=field, issue=self.issue, value="Montaje A", created_by=self.user, updated_by=self.user)
        item.full_clean()
        item.save()
        self.assertEqual(
            IzclickCustomFieldValue.objects.get(field=field, issue=self.issue).value,
            "Montaje A",
        )

    def test_update_value_persists(self):
        field = IzclickCustomField.objects.create(project=self.project, name="Costo", field_type="number")
        item = IzclickCustomFieldValue.objects.create(field=field, issue=self.issue, value=120, created_by=self.user, updated_by=self.user)
        item.value = 175
        item.full_clean()
        item.save()
        self.assertEqual(IzclickCustomFieldValue.objects.get(pk=item.pk).value, 175)

    def test_wrong_project_is_rejected(self):
        other = Project.objects.create(name="Eventos", identifier="EVE", workspace=self.workspace)
        field = IzclickCustomField.objects.create(project=other, name="Zona", field_type="text")
        item = IzclickCustomFieldValue(field=field, issue=self.issue, value="Sur", created_by=self.user, updated_by=self.user)
        with self.assertRaises(ValidationError):
            item.full_clean()

    def test_duplicate_case_insensitive_names_are_rejected(self):
        IzclickCustomField.objects.create(project=self.project, name="Zona", field_type="text")
        duplicate = IzclickCustomField(project=self.project, name="zona", field_type="text", created_by=self.user, updated_by=self.user)
        with self.assertRaises(ValidationError) as result:
            duplicate.full_clean()
        self.assertIn("constraint", str(result.exception).lower())
