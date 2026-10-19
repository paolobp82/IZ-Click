# Second-stage latency diagnosis (NOT ACTIVATED)

The v2 script is **not** installed on Contabo. Existing SSH dispatcher permits only predefined commands.

Scope:
- One PostgreSQL local socket SELECT 1 transaction (read-only; deadline 8s)
- One Redis PING (no key reads or writes; deadline 8s)
- Docker process metadata for API
- Two bounded unauthenticated GET requests to local /api/instances/ (no response body logged, no auth); requests can populate the ordinary application cache, so these are *observational probes* rather than strictly zero application-side writes.
- No personal information, raw logs, environment variables or SQL contents are printed.

Safety gates prior to server installation:
1. Review security: actual Redis container CLI availability, selected Docker names, whether localhost:80 is bound to the app's proxy, and risks of triggering cache writes.
2. Record SHA-256 of source and server copy and verify root ownership.
3. Back up root dispatcher and SSH forced command; add an exact allowlisted command with sudoers.
4. Verify script syntax, sudoers with visudo, SSH dispatcher syntax.
5. Only then update workflow to use v2 command and manually run once; never restart/redeploy.
6. If local proxy binding is unknown, **omit the curl probes** and rely on safe timing metrics.

This script distinguishes connection overhead, but quick PING/SELECT 1 cannot rule out query locks, slow cache GETs, or route stalls under load.
