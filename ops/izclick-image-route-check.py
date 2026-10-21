"""Verify the immutable candidate's restored routes without network access."""
from pathlib import Path
import time

started = time.perf_counter()
import django
django.setup()

from django.urls import resolve
from plane.db.models import IzClickProductionStatus, IzclickCustomField
from plane.app.views.workspace.izclick_production_status import serialize_status

root = '/api/workspaces/check/projects/00000000-0000-0000-0000-000000000001/'
assert resolve('/api/workspaces/check/izclick-production-statuses/').url_name == 'izclick-production-statuses'
assert resolve(root + 'izclick-custom-fields/').url_name == 'izclick-custom-fields'
assert resolve(root + 'production-event-dates/').url_name == 'izclick-production-event-dates'
assert resolve(root + 'production-sig-links/').url_name == 'izclick-production-sig-links'
assert callable(serialize_status)
assert list(Path('/code/plane/app/views/workspace/__pycache__').glob('izclick_production_status.*.pyc'))
print('BUILT_IMAGE_ROUTES_AND_BYTECODE_OK', round(time.perf_counter() - started, 3))
