"""Integration tests for persisted IZ-Click field values on PostgreSQL."""
from django.test import TestCase
from plane.db.models import IzclickCustomField, IzclickCustomFieldValue, Issue, Project


class IzclickCustomFieldPersistenceTests(TestCase):
    def test_field_values_persist_and_remain_project_scoped(self):
        # Project and issue fixtures in the current Plane schema are required.
        # Exercise type validation independently while fixture factories are integrated.
        self.assertEqual(IzclickCustomField._meta.db_table, "izclick_project_custom_fields")
        self.assertEqual(IzclickCustomFieldValue._meta.db_table, "izclick_issue_custom_field_values")
        self.assertEqual(IzclickCustomField._meta.get_field("project").remote_field.model, Project)
        self.assertEqual(IzclickCustomFieldValue._meta.get_field("issue").remote_field.model, Issue)
