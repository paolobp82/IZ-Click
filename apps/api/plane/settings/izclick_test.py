# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Isolated coordination contract tests: no production cache, broker, or SMTP."""

from .test import *  # noqa: F403

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
CELERY_BROKER_URL = "memory://"
CELERY_TASK_ALWAYS_EAGER = False
IZCLICK_COORDINATION_WORKSPACES = []
IZCLICK_COORDINATION_SUPERADMINS = []
