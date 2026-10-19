"""Regression: state validation must never mutate persisted defaults."""
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from plane.api.serializers.state import StateSerializer


class StateValidationNoWriteTests(SimpleTestCase):
    def test_invalid_triage_does_not_change_defaults(self):
        serializer = StateSerializer()
        with patch("plane.db.models.State.objects") as manager:
            with self.assertRaises(ValidationError):
                serializer.validate({"default": True, "group": "triage"})
            manager.filter.assert_not_called()

    def test_valid_default_is_side_effect_free(self):
        serializer = StateSerializer()
        with patch("plane.db.models.State.objects") as manager:
            result = serializer.validate({"default": True, "group": "started"})
            self.assertTrue(result["default"])
            manager.filter.assert_not_called()
