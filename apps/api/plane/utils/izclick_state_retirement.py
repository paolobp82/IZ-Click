"""Retire workflow states without cascading deletion to issues or history."""
from django.utils import timezone
from plane.db.models import Issue, IssueActivity, State


def retire_state(source, replacement, actor):
    if source.pk == replacement.pk or source.project_id != replacement.project_id or replacement.is_triage:
        raise ValueError("Elige otro estado del mismo proyecto.")
    moved = 0
    for issue in Issue.all_objects.select_for_update().filter(state_id=source.pk).order_by("id"):
        issue.state = replacement
        issue.updated_by = actor
        issue.save(update_fields=["state", "updated_by", "updated_at"], disable_auto_set_user=True)
        IssueActivity.objects.create(
            issue=issue, project_id=issue.project_id, workspace_id=issue.workspace_id,
            actor=actor, verb="updated", field="state", old_value=source.name,
            new_value=replacement.name, old_identifier=source.pk, new_identifier=replacement.pk,
        )
        moved += 1
    if source.default:
        State.objects.filter(pk=replacement.pk).update(default=True)
    # Instance.delete() queues recursive soft deletion. Do not invoke it here:
    # deleted issues, activities and references must remain intact.
    State.objects.filter(pk=source.pk).update(deleted_at=timezone.now(), default=False, updated_by=actor)
    return moved
