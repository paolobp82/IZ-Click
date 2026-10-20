# API repair candidate — 19 October 2026

## Confirmed production state

Administrator runtime check V2 confirmed that catalogue source, catalogue models,
custom-field models and the catalogue route are absent from the API container.
All four corresponding PostgreSQL tables are present. API and Web run different
source revisions. The Web continues to use the IZ-Click endpoints.

The measured PostgreSQL connections/SELECTs took 0.049–0.097 s. Fresh Redis
connections/PING took 2.706 s, 0.396 s and 0.380 s. Each sample includes connection
setup and does not isolate DNS, TCP and Redis execution. Cgroup CPU limits are
unlimited for this container, with no throttling recorded. Four CPUs are available.
Django setup completed in 14.645 s; the 20-second diagnostic then stopped while
importing routes. This is not proof that a live request exceeded its timeout.

## Candidate source

The API source baseline is identical to production commit
b515616cf8e8b453a13b0edb8f79a0b01d5fbfd6. Restore the IZ-Click catalogue,
custom fields, SIG references, event dates and catalogue project initialization
from the deployed Web revision 9ec35bf5e0d32676d37533e33a5548d1a90d1e85.
Keep email tasks, templates, schedules, dependencies and security fixes unchanged.

Implement the missing serialize_status function to match the deployed frontend
contract, and annotate binding counts to avoid a per-row GET count query. Invalid
non-string groups return 400. No existing states are renamed, regrouped or moved
by deployment. The two migration files are restored byte-for-byte from the
original revision; no new live migration is part of the procedure.

The candidate image overlays only application source onto the exact production
dependency image after CI verifies its registry digest against production.
Compile application Python bytecode during the image build. This removes source
compilation from cold imports; it is a mitigation pending runtime measurement.

## Administrator-console procedure

Use the exact image digest and source revision produced by the passing candidate
workflow. Review ops/izclick-apply-api-repair.py before running with sudo.

The script reads the real Compose file list from the running API labels and uses
the installation's plane.env, as the existing deployment scripts do. It checks
the current Web/API image identities, mounts and networks. It snapshots the
running environment privately rather than assuming old Compose values are current.
It validates the final merged environment before changing a service.

Before recreating API only, it saves a PostgreSQL custom-format dump, verifies its
archive listing and stores the existing API specification, Compose files and a
rollback command in a root-only repair-backup directory under /opt/iz-click/plane-app.
The new override preserves runtime environment, command and entrypoint, changing
only the API image and GUNICORN_WORKERS from one to two. No other service is
recreated; frontend, workers, database, Redis and volumes are retained.

After startup, it checks HTTPS through the local proxy and exercises actual
catalogue route creation, listing, duplicate detection and editing as a workspace
admin, entirely inside a rolled-back database transaction. It verifies that the
pre-existing states, task-state links and catalogue bindings are unchanged by that
test. These checks bypass browser login and do not replace a user's browser check.

Verification failures trigger an API-only rollback; the script never restores the
database automatically. An explicit saved rollback command is also available in
repair-backup-*/rollback-command.json. Preserve the active repair Compose override;
subsequent deployments must account for it.

## Remaining verification

Use the deployed UI to create a real state, refresh, and verify it remains available
for tasks. Check actual working operations and monitor new timeout/502 events over
a representative usage window. Two workers and bytecode compilation are mitigations;
do not claim sustained performance recovery from one sample.

SECRET_KEY is a confirmed insecure placeholder. It also encrypts saved instance
configuration, so rotation must preserve decryption access and account for sessions.
This candidate intentionally retains the key; rotation is a separate required task.

## Verified release artifact

- Candidate source: 8d64f2f1fb50fc3691c79427c9cd93d6c3d75d41.
- Immutable API: ghcr.io/paolobp82/izclick-api@sha256:50919c1c42ffcb3e289b6fec1b5617e9745894bdf73bcb5ca8e84b7d173c8df0.
- 33 PostgreSQL contract tests, 7 metadata contracts, 6 email contracts and 8
  operations tests passed: https://github.com/paolobp82/IZ-Click/actions/runs/39344603900.
  This run built the artifact but its first image check lacked REDIS_URL in the
  isolated test environment. No source or image repair was required for that test.
- The same immutable image passed the corrected network-isolated runtime check:
  https://github.com/paolobp82/IZ-Click/actions/runs/39345094921.
  All four restored routes, model imports, serializer and application bytecode
  were verified. Django plus route loading took 1.744 s on the CI host; this is
  not a production latency measurement.
- Later branch commits only adjust operations/workflow documentation; the API
  source and application script are identical to the tested candidate revision.
- Production application completed successfully through the administrator console
  on 20 October at 00:04 UTC (19 October in Lima). Backup:
  /opt/iz-click/plane-app/repair-backup-20261020T000407Z.
- Active Compose override:
  /opt/iz-click/plane-app/docker-compose.izclick-repair-20261020T000407Z.json.
  Preserve it when preparing subsequent deployments. Do not rerun the repair
  script against the now-changed baseline.
- The transaction smoke test passed creation, listing, duplicate handling and
  editing, with all test changes rolled back. Before/after hashes matched for
  the 10 existing states, 10 issues and their state relationships. Web and all
  other service container identities were unchanged.
- Initial startup returned 502 responses before three successful readiness
  samples at approximately 307, 313 and 318 seconds. Subsequent local HTTPS
  samples took 5.798, 0.142 and 0.704 seconds.
- Read-only diagnostics at 00:13:57 UTC found two API workers, zero new worker
  timeouts, zero worker exits, zero container restarts and no OOM events:
  https://github.com/paolobp82/IZ-Click/actions/runs/39346386308.
  Proxy counters cover six hours, including startup, and cannot establish a
  steady-state error rate. Sustained performance remains to be verified.
- Browser verification is blocked by ERR_NAME_NOT_RESOLVED on the user's
  connection. Google, Cloudflare and both authoritative nameservers return
  209.145.60.238; HTTPS requests using that address return valid instance/config
  JSON. Clearing the local DNS cache did not fix the connection's resolver.
  The user chose to test another connection; no persistent local DNS setting
  was changed. Real state creation and persistence in the browser remain pending.
