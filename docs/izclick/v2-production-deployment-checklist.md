# IZ-Click V2 — Production deployment gate
Candidate: 9ec35bf5e0d32676d37533e33a5548d1a90d1e85 (Web and API).
Status: NOT DEPLOYED. Approval and operational deployment procedure pending.

## Verified evidence
- GitHub Actions production preflight: Success; Compose config OK; 1 project, 10 states, 9 issues.
- Automated Postgres + MinIO backup: Success; verifies archives can be read.
- Isolated PostgreSQL restoration and migration 0124: Success; compares IDs/state associations.
- MinIO archive restore to disposable volume: Success; compares file contents. Does not verify object-level API access.

## Before production release
- Capture immutable CURRENT Web and API image digests and preserve them.
- Inspect the four Compose files in order with --env-file plane.env and confirm service config, networks, dependency behavior, and actual web/API traffic routes.
- Confirm expected production migration entrypoint without exposing credentials; verify 0124 is not already applied.
- Confirm exact override mechanism and effective docker compose config; do not overwrite production release file without rollback copy.
- Require a fresh backup and preserve it on host, then confirm downtime/approval.
- Restrict privileged remote deployment workflow to protected environment with required human approval, avoid generic SSH commands.
- Record baseline project, state, issue IDs and state_id associations.
- Stage overlay with candidate web/API tags ONLY. Never include database, storage, redis, or other service replacements in up command.
- Apply migration once, then update web and api services; check health, user login, uploads, and critical workflows.
- On failure revert web/API images; note migration rollback is separate from image rollback.
- No 'down -v', volume prune, schema reset, or destructive commands.

## Hold points
This file is an operational checkpoint, not an automated deployment. Actual release must be validated against live Compose configuration first.
