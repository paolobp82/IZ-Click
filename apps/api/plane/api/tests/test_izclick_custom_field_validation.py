"""Model validation regressions for IZ-Click custom fields.

These tests deliberately avoid creating project/issue fixtures. Django full_clean
covers types and option validation before any database write.
"""
from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from plane.db.models.izclick_custom_field import IzclickCustomField


class IzclickCustomFieldValidationTests(SimpleTestCase):
    def test_text_field_rejects_select_options(self):
        field = IzclickCustomField(name="Notas", field_type="text", options=[{"id": "a", "name": "A"}])
        with self.assertRaises(ValidationError):
            field.clean()

    def test_select_field_rejects_duplicate_option_ids(self):
        field = IzclickCustomField(
            name="Zona", field_type="select",
            options=[{"id": "norte", "name": "Norte"}, {"id": "norte", "name": "Norte II"}],
        )
        with self.assertRaises(ValidationError):
            field.clean()

    def test_select_field_rejects_missing_option_names(self):
        field = IzclickCustomField(name="Zona", field_type="select", options=[{"id": "norte"}])
        with self.assertRaises(ValidationError):
            field.clean()

    def test_select_field_accepts_colored_options(self):
        field = IzclickCustomField(
            name="Zona", field_type="select",
            options=[{"id": "norte", "name": "Norte", "color": "#3b82f6"}],
        )
        field.clean()

    def test_field_name_must_not_be_whitespace(self):
        field = IzclickCustomField(name="   ", field_type="text")
        with self.assertRaises(ValidationError):
            field.clean()

    def test_select_field_rejects_bad_option_color(self):
        field = IzclickCustomField(name="Zona", field_type="select", options=[{"id": "a", "name": "Norte", "color": "red"}])
        with self.assertRaises(ValidationError):
            field.clean()

    def test_select_field_rejects_blank_option_name(self):
        field = IzclickCustomField(name="Zona", field_type="select", options=[{"id": "a", "name": "   "}])
        with self.assertRaises(ValidationError):
            field.clean()

    def test_field_type_choices_are_declared(self):
        self.assertEqual(
            set(dict(IzclickCustomField.TYPES)),
            {"text", "number", "date", "select"},
        )
