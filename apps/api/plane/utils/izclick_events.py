"""IZ-Click project event dispatcher.

This adapter connects business events to Plane's existing notification table.
Call it AFTER persisting a project change, with a stable UUID event ID.
Email delivery remains a separate work item and is not implied by this API.
"""
from plane.utils.izclick_notifications import publish_project_notifications
from plane.utils.izclick_role_policy import event_recipients


EVENT_TITLES = {
    "project_created": "Nuevo proyecto pendiente de coordinación",
    "producer_assigned": "Productor asignado al proyecto",
    "producer_reassigned": "Cambio de productor responsable",
    "status_changed": "Estado del proyecto actualizado",
    "comment_created": "Nuevo comentario en el proyecto",
    "quotation_link_created": "Enlace de cotización agregado",
    "quotation_link_updated": "Enlace de cotización actualizado",
}


def dispatch_project_event(
    *,
    project,
    actor,
    event_id,
    event,
    project_url,
    coordinator_ids=(),
    producer_id=None,
    commercial_id=None,
    participant_ids=(),
    message=None,
):
    """Publish in-app alerts with a stable idempotency key.

    Recipient selection is centralized. Event-specific caller code is
    responsible for obtaining IDs from verified workspace roles and project
    participants. Never pass untrusted client-supplied recipient lists.
    """
    title = EVENT_TITLES.get(event)
    if title is None:
        raise ValueError(f"Unsupported IZ-Click event: {event}")
    recipients = event_recipients(
        event,
        coordinator_ids=coordinator_ids,
        producer_id=producer_id,
        commercial_id=commercial_id,
        participant_ids=participant_ids,
        actor_id=actor.pk,
    )
    if not recipients:
        return []
    return publish_project_notifications(
        project=project,
        event_id=event_id,
        event_name=f"izclick.{event}",
        actor=actor,
        recipients=recipients,
        title=title,
        message=message or title,
        project_url=project_url,
    )
