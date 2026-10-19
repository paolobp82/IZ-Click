"""Regression tests: preserve configuration values while narrowing the DB lookup."""
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from plane.license.utils.instance_value import get_configuration_value


class InstanceConfigurationLookupTests(SimpleTestCase):
    @override_settings(SKIP_ENV_VAR=True)
    @patch("plane.license.utils.instance_value.decrypt_data")
    @patch("plane.license.utils.instance_value.InstanceConfiguration")
    def test_requested_keys_and_encrypted_values(self, model, decrypt):
        model.objects.filter.return_value.values.return_value = [
            {"key": "PUBLIC", "value": "enabled", "is_encrypted": False},
            {"key": "SECRET", "value": "ciphertext", "is_encrypted": True},
        ]
        decrypt.return_value = "plaintext"
        requested = [
            {"key": "PUBLIC", "default": "disabled"},
            {"key": "MISSING", "default": "fallback"},
            {"key": "SECRET", "default": ""},
            {"key": "PUBLIC", "default": "disabled"},
        ]
        result = get_configuration_value(requested)
        self.assertEqual(result, ("enabled", "fallback", "plaintext", "enabled"))
        model.objects.filter.assert_called_once_with(
            key__in={"PUBLIC", "MISSING", "SECRET"}
        )
        decrypt.assert_called_once_with("ciphertext")

    @override_settings(SKIP_ENV_VAR=False)
    @patch.dict("os.environ", {"IZCLICK_TEST_VALUE": "from-env"})
    @patch("plane.license.utils.instance_value.InstanceConfiguration")
    def test_env_mode_does_not_query_database(self, model):
        self.assertEqual(
            get_configuration_value([{"key": "IZCLICK_TEST_VALUE", "default": "fallback"}]),
            ("from-env",),
        )
        model.objects.filter.assert_not_called()
