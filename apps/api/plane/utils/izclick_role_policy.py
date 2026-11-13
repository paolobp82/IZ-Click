"""IZ-Click business role policy.

These business roles are deliberately separate from Plane workspace membership and
instance-admin permissions. Do not replace Plane's authorization with this module
until endpoint-level checks and migration have been implemented.
"""

from enum import Enum


class BusinessRole(str, Enum):
    COMMERCIAL = "commercial"
    COORDINATOR = "coordinator"
    PRODUCER = "producer"


def can_create_project(role: BusinessRole, *, superadmin: bool = False) -> bool:
    return superadmin or role in (BusinessRole.COMMERCIAL, BusinessRole.COORDINATOR)


def can_assign_producer(role: BusinessRole, *, superadmin: bool = False) -> bool:
    return superadmin or role == BusinessRole.COORDINATOR


def can_view_agency_projects(role: BusinessRole, *, superadmin: bool = False) -> bool:
    return superadmin or role in BusinessRole


def can_edit_project(
    role: BusinessRole,
    *,
    is_assigned_producer: bool,
    superadmin: bool = False,
) -> bool:
    if superadmin or role == BusinessRole.COORDINATOR:
        return True
    if role == BusinessRole.PRODUCER:
        return is_assigned_producer
    return False


def coordination_recipients(coordinator_user_ids):
    """Return both coordinator IDs, de-duplicated without altering input order."""
    return list(dict.fromkeys(coordinator_user_ids))


def event_recipients(event, *, coordinator_ids=(), producer_id=None,
                     commercial_id=None, participant_ids=(), actor_id=None):
    """Resolve recipient IDs; delivery channel policy is handled separately."""
    if event == "project_created":
        ids = coordinator_ids
    elif event in ("producer_assigned", "producer_reassigned"):
        ids = (producer_id, commercial_id)
    elif event in ("status_changed", "comment_created"):
        ids = participant_ids
    elif event in ("quotation_link_created", "quotation_link_updated"):
        ids = (*coordinator_ids, commercial_id)
    else:
        raise ValueError(f"Unsupported IZ-Click event: {event}")
    return [uid for uid in dict.fromkeys(ids) if uid is not None and uid != actor_id]
