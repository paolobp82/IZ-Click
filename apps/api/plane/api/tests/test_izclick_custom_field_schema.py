"""Database-backed custom-field persistence and isolation checks."""
from django.core.exceptions import ValidationError
from django.test import TestCase

from plane.db.models import (
    IzclickCustomField,
    IzclickCustomFieldValue,
    Issue,
    Project,
    Workspace,
    User,
)


class IzclickCustomFieldPersistenceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create(
            username="izclick_field_test_user",
            email="izclick-test@example.invalid",
        )
        cls.workspace = Workspace.objects.create(
            name="IZ-Click Field Tests", slug="izclick-field-test", owner=cls.user,
        )
        cls.project = Project.objects.create(
            name="Montajes", identifier="MON", workspace=cls.workspace,
        )
        cls.issue = Issue.objects.create(
            name="Tarea prueba de campo", project=cls.project,
            workspace=cls.workspace, sequence_id=1,
        )

    def make_field(self, name, kind="text", project=None, options=None):
        field = IzclickCustomField(
            project=project or self.project,
            name=name,
            field_type=kind,
            options=options if options is not None else [],
            created_by=self.user,
            updated_by=self.user,
        )
        field.full_clean()
        field.save(disable_auto_set_user=True)
        return field

    def save_value(self, field, value, issue=None):
        record = IzclickCustomFieldValue(
            field=field, issue=issue or self.issue, value=value,
            created_by=self.user, updated_by=self.user,
        )
        record.full_clean()
        record.save(disable_auto_set_user=True)
        return record

    def test_text_value_and_audit_persist_after_reload(self):
        field = self.make_field("Orden de montaje")
        item = self.save_value(field, "Montaje A")
        loaded = IzclickCustomFieldValue.objects.get(pk=item.pk)
        self.assertEqual(loaded.value, "Montaje A")
        self.assertEqual(loaded.created_by_id, self.user.pk)
        self.assertEqual(loaded.updated_by_id, self.user.pk)
        self.assertEqual(IzclickCustomField.objects.get(pk=field.pk).created_by_id, self.user.pk)

    def test_numeric_value_update_and_audit_persist(self):
        field = self.make_field("Costo", kind="number")
        item = self.save_value(field, 120)
        item.value = 175
        item.updated_by = self.user
        item.full_clean()
        item.save(disable_auto_set_user=True)
        loaded = IzclickCustomFieldValue.objects.get(pk=item.pk)
        self.assertEqual(loaded.value, 175)
        self.assertEqual(loaded.created_by_id, self.user.pk)

    def test_invalid_cross_project_value_rejected(self):
        other = Project.objects.create(
            name="Eventos", identifier="EVE", workspace=self.workspace,
        )
        field = self.make_field("Zona", project=other)
        item = IzclickCustomFieldValue(
            field=field, issue=self.issue, value="Sur",
            created_by=self.user, updated_by=self.user,
        )
        with self.assertRaises(ValidationError) as result:
            item.full_clean()
        self.assertIn("issue", result.exception.message_dict)

    def test_duplicate_name_is_case_insensitive(self):
        self.make_field("Zona")
        duplicate = IzclickCustomField(
            project=self.project, name="zona", field_type="text",
            created_by=self.user, updated_by=self.user,
        )
        with self.assertRaises(ValidationError):
            duplicate.full_clean()

    def test_select_value_persists_and_invalid_option_is_rejected(self):
        field = self.make_field(
            "Zona de activación", kind="select",
            options=[{"id": "norte", "name": "Norte", "color": "#3388CC"}],
        )
        self.save_value(field, "norte")
        invalid = IzclickCustomFieldValue(
            field=field, issue=self.issue, value="sur",
            created_by=self.user, updated_by=self.user,
        )
        with self.assertRaises(ValidationError) as result:
            invalid.full_clean()
        self.assertIn("value", result.exception.message_dict)
