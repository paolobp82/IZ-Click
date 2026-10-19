# IZ-Click — Gunicorn/Caddy incident investigation (2026-10-19)

## Verified observations
- GitHub Actions read-only run #5: https://github.com/paolobp82/IZ-Click/actions/runs/39310054696
- In 6-hour bounded log sample, Gunicorn 7 WORKER TIMEOUT, 7 worker boot entries; proxy 7 lines containing 502, 7 containing EOF. Event times not yet cross-correlated; counts alone do not prove one-to-one mapping.
- API container restart count 2, OOMKilled=false; 178.4 MiB memory at snapshot. Host ~6 GB available RAM, disk 11% full.
- PostgreSQL activity sample: active=1, idle=1, other background=5; snapshot does not rule out intermittent lock/latency spikes.
- API Docker status is running. No Docker restart or deploy authorized during this investigation.

## Source path of suspect route
- `apps/api/plane/urls.py` mounts `plane.license.urls` at `/api/instances/`.
- `apps/api/plane/license/urls.py` maps empty suffix to `InstanceEndpoint.get`.
- `apps/api/plane/license/api/views/instance.py` retrieves Instance.objects.first(), serializes instance, calls get_configuration_value() for 13 settings, and Workspace.objects.count(). Decorated with cache_response(7200, user=False).
- `apps/api/bin/docker-entrypoint-api.sh` launches Gunicorn with UvicornWorker, GUNICORN_WORKERS, no explicit timeout flag. Verify effective timeout/runtime args before changing anything.

## Priority hypothesis checks
1. Correlate timestamp of WORKER TIMEOUT with proxy 502/EOF by minute; sanitized aggregate only.
2. Confirm current worker count/timeout and lifecycle (bounded `docker top`, sanitized `docker inspect`).
3. Correlate per-minute cache miss and DB wait/locks at incident time. Avoid any expensive production queries.
4. Inspect `get_configuration_value` and `cache_response` for expensive synchronous calls, cache stampedes or external dependencies.
5. If measurements show long-running route, benchmark locally/staging and prepare a narrowly scoped source fix, test on a restored copy, then review planned change and rollback.

## Safeguards
- Do not raise Gunicorn timeout by default.
- Do not run live schema migrations, restart containers, redeploy images, or alter volumes.
- Do not publish raw request logs, URLs with query values, cookies, authorization headers or environment.
- SSH enforced command permits only explicit operations; second-generation telemetry requires an administrator-reviewed root-owned script and sudoers entry. The GitHub connector cannot bypass it.
- Protect all UX/personalization changes by comparing deployed image tag against target commits and verifying rollback artifacts.
