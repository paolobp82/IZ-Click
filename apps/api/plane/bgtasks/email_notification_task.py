# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import logging
import re
from datetime import datetime
from email.utils import formataddr
from uuid import UUID

from bs4 import BeautifulSoup

# Third party imports
from celery import shared_task
from django.core.mail import EmailMultiAlternatives, get_connection
from django.template.loader import render_to_string

# Django imports
from django.utils import timezone

# Module imports
from plane.db.models import EmailNotificationLog, Issue, State, User
from plane.license.utils.instance_value import get_email_configuration
from plane.settings.redis import redis_instance
from plane.utils.email import generate_plain_text_from_html
from plane.utils.exception_logger import log_exception


def _state_name(raw_value, project_id):
    if not raw_value:
        return ""
    raw_value = str(raw_value)
    try:
        state_id = UUID(raw_value)
    except (TypeError, ValueError, AttributeError):
        return raw_value
    return (
        State.objects.filter(pk=state_id, project_id=project_id)
        .values_list("name", flat=True).first()
        or raw_value
    )


def remove_unwanted_characters(input_text):
    # Remove only control characters and potentially problematic characters for email subjects
    processed_text = re.sub(r"[\x00-\x1F\x7F-\x9F]", "", input_text)
    return processed_text


# acquire and delete redis lock
def acquire_lock(lock_id, expire_time=300):
    redis_client = redis_instance()
    """Attempt to acquire a lock with a specified expiration time."""
    return redis_client.set(lock_id, "true", nx=True, ex=expire_time)


def release_lock(lock_id):
    """Release a lock."""
    redis_client = redis_instance()
    redis_client.delete(lock_id)


@shared_task
def stack_email_notification():
    # get all email notifications
    email_notifications = EmailNotificationLog.objects.filter(processed_at__isnull=True).order_by("receiver").values()

    # Create the below format for each of the issues
    # {"issue_id" : { "actor_id1": [ { data }, { data } ], "actor_id2": [ { data }, { data } ] }}

    # Convert to unique receivers list
    receivers = list(set([str(notification.get("receiver_id")) for notification in email_notifications]))
    # Queue one job per issue/receiver with only its own notification IDs.
    # Keep processed_at unset until SMTP confirms success so failed sends are visible.
    for receiver_id in receivers:
        receiver_notifications = [
            notification
            for notification in email_notifications
            if str(notification.get("receiver_id")) == receiver_id
        ]
        by_issue = {}
        for notification in receiver_notifications:
            issue_id = notification.get("entity_identifier")
            bucket = by_issue.setdefault(issue_id, {"actors": {}, "ids": []})
            bucket["actors"].setdefault(str(notification.get("triggered_by_id")), []).append(
                notification.get("data")
            )
            bucket["ids"].append(notification.get("id"))

        for issue_id, bucket in by_issue.items():
            send_email_notification.delay(
                issue_id=issue_id,
                notification_data=bucket["actors"],
                receiver_id=receiver_id,
                email_notification_ids=bucket["ids"],
            )


def create_payload(notification_data):
    # return format {"actor_id":  { "key": { "old_value": [], "new_value": [] } }}
    data = {}
    for actor_id, changes in notification_data.items():
        for change in changes:
            issue_activity = change.get("issue_activity")
            if issue_activity:  # Ensure issue_activity is not None
                field = issue_activity.get("field")
                old_value = str(issue_activity.get("old_value"))
                new_value = str(issue_activity.get("new_value"))

                # Append old_value if it's not empty and not already in the list
                if old_value:
                    (
                        data.setdefault(actor_id, {})
                        .setdefault(field, {})
                        .setdefault("old_value", [])
                        .append(old_value)
                        if old_value not in data.setdefault(actor_id, {}).setdefault(field, {}).get("old_value", [])
                        else None
                    )

                # Append new_value if it's not empty and not already in the list
                if new_value:
                    (
                        data.setdefault(actor_id, {})
                        .setdefault(field, {})
                        .setdefault("new_value", [])
                        .append(new_value)
                        if new_value not in data.setdefault(actor_id, {}).setdefault(field, {}).get("new_value", [])
                        else None
                    )

                if not data.get("actor_id", {}).get("activity_time", False):
                    data[actor_id]["activity_time"] = str(
                        datetime.fromisoformat(issue_activity.get("activity_time").rstrip("Z")).strftime(
                            "%Y-%m-%d %H:%M:%S"
                        )
                    )

    return data


def process_mention(mention_component):
    soup = BeautifulSoup(mention_component, "html.parser")
    mentions = soup.find_all("mention-component")
    for mention in mentions:
        user_id = mention["entity_identifier"]
        user = User.objects.get(pk=user_id)
        user_name = user.display_name
        highlighted_name = f"@{user_name}"
        mention.replace_with(highlighted_name)
    return str(soup)


def process_html_content(content):
    if content is None:
        return None
    processed_content_list = []
    for html_content in content:
        processed_content = process_mention(html_content)
        processed_content_list.append(processed_content)
    return processed_content_list


@shared_task
def send_email_notification(issue_id, notification_data, receiver_id, email_notification_ids):
    # Convert UUIDs to a sorted, concatenated string
    sorted_ids = sorted(email_notification_ids)
    ids_str = "_".join(str(id) for id in sorted_ids)
    lock_id = f"send_email_notif_{issue_id}_{receiver_id}_{ids_str}"

    # acquire the lock for sending emails
    try:
        if acquire_lock(lock_id=lock_id):
            # Another worker may already have delivered this exact batch.
            if not EmailNotificationLog.objects.filter(pk__in=email_notification_ids, sent_at__isnull=True).exists():
                release_lock(lock_id=lock_id)
                return

            # get the redis instance
            ri = redis_instance()
            base_api = ri.get(str(issue_id)).decode() if ri.get(str(issue_id)) else None

            # Skip if base api is not present
            if not base_api:
                release_lock(lock_id=lock_id)
                return

            data = create_payload(notification_data=notification_data)

            # Get email configurations
            (
                EMAIL_HOST,
                EMAIL_HOST_USER,
                EMAIL_HOST_PASSWORD,
                EMAIL_PORT,
                EMAIL_USE_TLS,
                EMAIL_USE_SSL,
                EMAIL_FROM,
            ) = get_email_configuration()

            receiver = User.objects.get(pk=receiver_id)
            issue = Issue.objects.get(pk=issue_id)
            template_data = []
            total_changes = 0
            comments = []
            actors_involved = []
            for actor_id, changes in data.items():
                actor = User.objects.get(pk=actor_id)
                total_changes = total_changes + len(changes)
                comment = changes.pop("comment", False)
                mention = changes.pop("mention", False)
                actors_involved.append(actor_id)
                if comment:
                    comments.append(
                        {
                            "actor_comments": comment,
                            "actor_detail": {
                                "avatar_url": f"{base_api}{actor.avatar_url}",
                                "first_name": actor.first_name,
                                "last_name": actor.last_name,
                            },
                        }
                    )
                if mention:
                    mention["new_value"] = process_html_content(mention.get("new_value"))
                    mention["old_value"] = process_html_content(mention.get("old_value"))
                    comments.append(
                        {
                            "actor_comments": mention,
                            "actor_detail": {
                                "avatar_url": f"{base_api}{actor.avatar_url}",
                                "first_name": actor.first_name,
                                "last_name": actor.last_name,
                            },
                        }
                    )
                activity_time = changes.pop("activity_time")
                # Parse the input string into a datetime object
                formatted_time = datetime.strptime(activity_time, "%Y-%m-%d %H:%M:%S").strftime("%H:%M %p")

                if changes:
                    template_data.append(
                        {
                            "actor_detail": {
                                "avatar_url": f"{base_api}{actor.avatar_url}",
                                "first_name": actor.first_name,
                                "last_name": actor.last_name,
                            },
                            "changes": changes,
                            "issue_details": {
                                "name": issue.name,
                                "identifier": f"{issue.project.identifier}-{issue.sequence_id}",
                            },
                            "activity_time": str(formatted_time),
                        }
                    )

            summary = "Updates were made to the issue by"

            # Send the mail
            subject = f"{issue.project.identifier}-{issue.sequence_id} {remove_unwanted_characters(issue.name)}"
            context = {
                "data": template_data,
                "summary": summary,
                "actors_involved": len(set(actors_involved)),
                "issue": {
                    "issue_identifier": f"{str(issue.project.identifier)}-{str(issue.sequence_id)}",
                    "name": issue.name,
                    "issue_url": f"{base_api}/{str(issue.project.workspace.slug)}/projects/{str(issue.project.id)}/issues/{str(issue.id)}",  # noqa: E501
                },
                "receiver": {"email": receiver.email},
                "issue_url": f"{base_api}/{str(issue.project.workspace.slug)}/projects/{str(issue.project.id)}/issues/{str(issue.id)}",  # noqa: E501
                "project_url": f"{base_api}/{str(issue.project.workspace.slug)}/projects/{str(issue.project.id)}/issues/",  # noqa: E501
                "workspace": str(issue.project.workspace.slug),
                "project": str(issue.project.name),
                "user_preference": f"{base_api}/{str(issue.project.workspace.slug)}/settings/account/notifications/",
                "comments": comments,
                "entity_type": "issue",
            }
            # IZ-Click email presentation; preserve the existing Plane event routing.
            changed_fields = {
                field for entry in template_data for field in entry.get("changes", {}).keys()
            }
            if "state" in changed_fields:
                mail_title = f"Cambio de estado · {issue.name}"
                mail_message = "Se actualizó el estado de este pendiente."
            elif "assignees" in changed_fields or "assignee" in changed_fields:
                mail_title = f"Te asignaron un pendiente · {issue.name}"
                mail_message = "Se actualizó la asignación de responsables."
            else:
                mail_title = f"Actualización de pendiente · {issue.name}"
                mail_message = "Se registraron cambios en este pendiente."
            state_change = next(
                (entry.get("changes", {}).get("state") for entry in template_data
                 if entry.get("changes", {}).get("state")), None
            )
            context.update({
                "title": mail_title,
                "message": mail_message,
                "project_name": issue.project.name,
                "list_name": "Pendientes",
                "task_url": context["issue_url"],
                "preferences_url": context["user_preference"],
                "due_date": issue.target_date.strftime("%d/%m/%Y") if issue.target_date else "",
                "old_state": _state_name((state_change or {}).get("old_value", [""])[0], issue.project_id) if state_change else "",
                "new_state": _state_name((state_change or {}).get("new_value", [""])[0], issue.project_id) if state_change else "",
            })
            subject = f"[IZ-Click] {mail_title}"
            html_content = render_to_string("emails/notifications/izclick-event.html", context)
            text_content = generate_plain_text_from_html(html_content)

            try:
                connection = get_connection(
                    host=EMAIL_HOST,
                    port=int(EMAIL_PORT),
                    username=EMAIL_HOST_USER,
                    password=EMAIL_HOST_PASSWORD,
                    use_tls=EMAIL_USE_TLS == "1",
                    use_ssl=EMAIL_USE_SSL == "1",
                )

                msg = EmailMultiAlternatives(
                    subject=subject,
                    body=text_content,
                    from_email=formataddr(("IZ-Click | Izango", EMAIL_FROM)),
                    to=[receiver.email],
                    connection=connection,
                )
                msg.attach_alternative(html_content, "text/html")
                delivered = msg.send()
                if delivered != 1:
                    raise RuntimeError("SMTP did not confirm email acceptance")
                logging.getLogger("plane.worker").info("Email Sent Successfully")

                # Update the logs
                EmailNotificationLog.objects.filter(pk__in=email_notification_ids, sent_at__isnull=True).update(\n                    sent_at=timezone.now(), processed_at=timezone.now()\n                )

                # release the lock
                release_lock(lock_id=lock_id)
                return
            except Exception as e:
                log_exception(e)
                # release the lock
                release_lock(lock_id=lock_id)
                return
        else:
            logging.getLogger("plane.worker").info("Duplicate email received skipping")
            return
    except (Issue.DoesNotExist, User.DoesNotExist):
        release_lock(lock_id=lock_id)
        return
    except Exception as e:
        log_exception(e)
        release_lock(lock_id=lock_id)
        return
