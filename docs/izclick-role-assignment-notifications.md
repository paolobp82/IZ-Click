# IZ-Click — Roles, intake, assignment and event notifications

Status: implementation specification (not deployed). Base: preview.
Date: 2026-11-13.

## Roles and access
- Superadmin + commercial: Paolo Bastianelli. Superadmin retains unrestricted administrative permissions.
- Commercial: Luciana Vergoncini, José Manuel Sosa.
- Coordinator: María Paula Salas, Angélica Estupiñán.
- All other active human users: producer. Exclude service accounts and system administrators until verified.
- Admin can change a user's business role without deleting identity, memberships, project ownership, comments, uploads, or audit history.
- Everyone can READ all agency projects and workload; only authorized actors may WRITE. Preserve current memberships, links, attachments, addresses, statuses, and existing data.

## Intake and assignment
1. Commercial or coordinator creates a project with customer, description, dates, and existing metadata.
2. Commercial-created projects enter ONE shared coordination queue, visible to BOTH coordinators; no coordinator selection required.
3. Coordinator-created projects can enter the same queue or be assigned by the creator.
4. Coordinator inspects per-producer active projects, names, clients, due dates, status, overdue flags and upcoming deliveries before choosing.
5. Only coordinators or superadmin can assign/reassign a producer. Assignment is transactional: concurrent coordinators cannot silently overwrite each other; a subsequent change is an audited reassignment.
6. Assignment updates the regular project listing and preserves existing project identifier and content.
7. Producer can manage assigned work; cannot assign producer. All agency staff can see overall workload.

## Events and delivery
Events: project_created, producer_assigned, producer_reassigned, status_changed, comment_created, quotation_link_created, quotation_link_updated.
- Persist in-app notification with recipient, project, actor, event ID, timestamp, read flag and deep link.
- Deliver email asynchronously to relevant recipients: new project -> both coordinators; assignment -> assigned producer and originating commercial; state change -> project stakeholders; comment -> project participants other than author; quote link -> originating commercial and coordinator(s).
- De-duplicate by (event ID, recipient, channel); retries must be idempotent.
- Do not send notifications for historical data migration or unchanged fields.
- Email links must resolve to the exact project and quote; use configured SMTP/provider credentials, never embed secrets.
- A failed email must not roll back project updates. Record failure for retry.
- Confirm which existing Plane notification and mail infrastructure can be extended before adding a second system.

## Migration and release safeguards
- Inventory existing Plane user roles, project memberships, state transitions, email infrastructure and customizations.
- Map the named users to verified user IDs before changing roles; never match loosely on names.
- Preserve all existing data; use additive, reversible migrations.
- Add backend permission tests, coordinator race-condition tests, email deduplication tests and frontend visibility tests.
- Verify on staging with real role scenarios before any production deployment.
- No production deployment without backup, migration dry run and explicit release approval.

## Acceptance scenarios
- Commercial creates project -> both coordinators see same unassigned entry.
- Coordinator A assigns -> producer and commercial receive one in-app alert and one email each; coordinator B sees assignment without duplicate.
- Coordinator B reassigns -> previous/new responsible parties are notified appropriately and history remains.
- Any project status change -> stakeholder notification + email with old/new status.
- Comment and quote link changes -> correct notifications and links.
- Producer sees all projects but cannot edit projects not assigned or change producer.
- Admin changes a producer to commercial and back without loss of historical records.
