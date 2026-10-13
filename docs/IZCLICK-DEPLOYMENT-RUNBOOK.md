# IZ-Click — Production deployment runbook (Plane v1.4.2)

> Status: preparation only. **Do not deploy unless CI build, backup, and restore checks are green.**
> IZ-Click is standalone; do not edit the separate SIG Izango application.

## Current installation (documented, verify before running commands)

- Host: Contabo Ubuntu VPS, SSH user `izango`
- Application directory: `/opt/iz-click/plane-app`
- Existing release: Plane Community v1.4.2 (official images)
- User-facing domain: `https://izclick.izango.com.pe`
- Custom source: branch `izclick/v1.4.2-custom`
- **No direct relationship between this branch and the images currently running.**

## Release gate

1. GitHub Actions i18n parity and types checks successful (record run URLs).
2. Docker image build checks successful for **web** and **admin**.
3. Review exact image names, immutable digests, proxy routing, and release compatibility.
4. Back up database **and** object storage and application configuration; back up off-VPS.
5. Perform a restore rehearsal on an isolated environment.
6. Capture currently running compose configuration and immutable image digests.
7. Prepare an explicit rollback plan before any container is replaced.
8. Obtain approval for a maintenance window and proceed only after verification.

## Read-only preflight commands (on VPS)

```bash
cd /opt/iz-click/plane-app
sudo docker compose ps
sudo docker compose config --services
sudo docker compose images
sudo docker compose ls
sudo df -h
sudo free -h
```

Do not paste `plane.env`, `docker compose config` full output, database dumps, tokens, SMTP credentials, or private SSH keys into chat.

## Database/object storage caution

Plane contains persistent PostgreSQL data, attachment objects, and broker/cache services. A
copy of compose YAML alone is **not** a backup. Discover actual volumes and back up each
persistent store consistently, including PostgreSQL and MinIO/S3-compatible object storage.
Archive `plane.env` securely with restricted permissions.

Never run `docker compose down -v`, `docker volume prune`, `docker system prune --volumes`,
or database schema migrations as part of a UI-only translation release.

## UI-only roll-forward strategy (planned, not yet verified)

- Publish verified web/admin image digests with versioned tags.
- Create a **separate compose override** specifying only web/admin image substitutions.
- Preserve the existing proxy, API, migrations, DB, RabbitMQ, Redis, and object storage.
- Check that the image serves the same app path and uses compatible build-time URLs.
- Test login, translations, task creation, attachment access, and admin after roll-forward.
- Check health and logs. Roll back web/admin to prior pinned digests upon regression.

## Exit criteria

- Production HTTPS healthy, all container services healthy.
- Representative Spanish navigation and task flows verified.
- Recovery procedure exercised and backup retrieval confirmed.
- No changes to SIG Izango 360.
