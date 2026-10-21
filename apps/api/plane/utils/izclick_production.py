"""Pure validators for IZ-Click metadata exposed by Plane endpoints.

No Django imports: usable in fast tests without database or secrets.
"""
import re
from datetime import date
from urllib.parse import urlsplit
from uuid import UUID

SIG_PREFIX = "SIG Izango 360 | "
SIG_HOST = "izango-erp.vercel.app"
SIG_CODE_RE = re.compile(r"^[A-Z0-9][A-Z0-9 -]{1,59}$")
PROJECT_PATH_RE = re.compile(
    r"^/proyectos/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/?$"
)


def valid_event_date(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        return None
    if parsed.isoformat() != value:
        return None
    return value


def valid_sig_code_url(code, url):
    if not isinstance(code, str) or not SIG_CODE_RE.fullmatch(code):
        return False
    if not isinstance(url, str):
        return False
    try:
        parsed = urlsplit(url)
        if (parsed.scheme != "https" or parsed.hostname != SIG_HOST
                or parsed.port is not None or parsed.username or parsed.password
                or parsed.query or parsed.fragment):
            return False
        match = PROJECT_PATH_RE.fullmatch(parsed.path)
        if not match:
            return False
        UUID(match.group(1))
        return True
    except ValueError:
        return False
