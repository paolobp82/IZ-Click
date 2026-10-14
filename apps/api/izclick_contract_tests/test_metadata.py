"""Contract tests for IZ-Click read APIs: no Django, network or database required."""
import importlib.util
from pathlib import Path
import unittest

MODULE_PATH = Path(__file__).resolve().parents[1] / "plane" / "utils" / "izclick_production.py"
spec = importlib.util.spec_from_file_location("izclick_validators", MODULE_PATH)
assert spec and spec.loader
validators = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validators)

GOOD_URL = "https://izango-erp.vercel.app/proyectos/664584ac-7152-4799-9b9e-72e980213a67"


class IzclickMetadataContracts(unittest.TestCase):
    def test_event_date_leap_year_and_invalid_dates(self):
        self.assertEqual(validators.valid_event_date("2024-02-29"), "2024-02-29")
        for raw in ("2026-02-29", "2026-13-01", "20261020", "2026-10-10T12:00:00", None, 42):
            self.assertIsNone(validators.valid_event_date(raw))

    def test_sig_code_and_exact_url(self):
        self.assertTrue(validators.valid_sig_code_url("IZ-26968", GOOD_URL))
        for url in (
            "javascript:alert(1)",
            "https://izango-erp.vercel.app.evil.example/proyectos/664584ac-7152-4799-9b9e-72e980213a67",
            GOOD_URL + "?a=1",
            GOOD_URL + "/cotizaciones",
            "http://izango-erp.vercel.app/proyectos/664584ac-7152-4799-9b9e-72e980213a67",
        ):
            self.assertFalse(validators.valid_sig_code_url("IZ-26968", url))

    def test_sig_code_disallows_control_chars_and_html(self):
        for code in ("<script>", "IZ-\n26968", "", "a" * 80, None):
            self.assertFalse(validators.valid_sig_code_url(code, GOOD_URL))


if __name__ == "__main__":
    unittest.main()
