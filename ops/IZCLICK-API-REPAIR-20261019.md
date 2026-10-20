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
- Production application and sustained performance verification remain pending
  administrator-console execution. Do not describe this artifact as deployed.
