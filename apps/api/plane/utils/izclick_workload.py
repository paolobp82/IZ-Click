"""Pure workload summary helpers for IZ-Click coordination.

No database writes: callers must supply visible, authorized project records.
Dates are ISO YYYY-MM-DD; closed statuses are supplied by the caller, not guessed.
"""
from collections import defaultdict
from datetime import date, timedelta


def summarize_producer_workload(projects, producer_ids, *, today=None,
                                closed_statuses=()):
    today = today or date.today()
    closed = set(closed_statuses)
    by_producer = defaultdict(list)
    for project in projects:
        producer_id = project.get("producer_id")
        if producer_id is None:
            continue
        status = project.get("status")
        if status in closed:
            continue
        due = project.get("due_date")
        if isinstance(due, str) and due:
            due = date.fromisoformat(due)
        by_producer[producer_id].append({
            "project_id": project["project_id"],
            "name": project.get("name", ""),
            "client": project.get("client", ""),
            "status": status,
            "due_date": due.isoformat() if due else None,
            "overdue": bool(due and due < today),
            "due_soon": bool(due and today <= due <= today + timedelta(days=7)),
        })
    result = []
    for producer_id in dict.fromkeys(producer_ids):
        active = sorted(
            by_producer[producer_id],
            key=lambda item: (item["due_date"] is None, item["due_date"] or "",
                              str(item["project_id"])),
        )
        result.append({
            "producer_id": producer_id,
            "active_count": len(active),
            "overdue_count": sum(p["overdue"] for p in active),
            "due_soon_count": sum(p["due_soon"] for p in active),
            "projects": active,
        })
    return result
