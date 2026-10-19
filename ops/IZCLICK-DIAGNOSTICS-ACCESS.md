# IZ-Click diagnostic access — review before activation

**Current status: proposal only. Nothing on the VPS is changed by these repository files.**

Existing SSH key forces `/home/izango/.local/bin/izclick-connection-check`. This is intentional. Do not remove `command=` or `restrict`, and do not add `izango` to the Docker group.

## Installation plan (requires manual root review and approval)

1. Review `ops/izclick-diagnostics-v1.sh`. It prints metadata and aggregate event counts, not full application logs.
2. After approval, install it with root ownership to `/usr/local/sbin/izclick-diagnostics-v1` (mode 0755) using an administrator-controlled method. **Never run unreviewed remote repository code as root.**
3. In `/usr/local/sbin/izclick-controlled-ops`, add exactly one case arm before the fallback:
   ```bash
   diagnostics)
     exec /usr/local/sbin/izclick-diagnostics-v1
     ;;
   ```
4. Add exactly one `sudoers` NOPASSWD entry (use `visudo -f` to validate):
   ```
   izango ALL=(root) NOPASSWD: /usr/local/sbin/izclick-controlled-ops diagnostics
   ```
5. In the forced-command dispatcher, add one exact-match case arm:
   ```sh
   izclick-diagnostics)
     exec sudo -n /usr/local/sbin/izclick-controlled-ops diagnostics
     ;;
   ```
6. Validate syntax of both dispatchers (`sh -n` / `bash -n`), `visudo -c`, root ownership, fixed paths and restrictive SSH access **before** invoking through GitHub Actions. Keep a rollback copy of the original dispatcher and controlled-ops; do not restart SSH.
7. Only after server-side authorization is installed and validated, change GitHub Actions from `izclick-status` to `izclick-diagnostics` and trigger one manual run.

No restarts, deployments, database writes, migrations, or volume changes are part of this plan. Because the repository is public and Actions logs may be visible, never print secrets, raw Docker logs, request URLs, or environment variables. Consider tightening the script further before enabling it.
