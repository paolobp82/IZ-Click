# IZ-Click status catalogue is additive. Existing Plane states/issues are untouched.
import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0122_alter_draftissue_assignees_alter_issue_assignees_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="IzClickProductionStatus",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=120)),
                ("color", models.CharField(default="#64748b", max_length=7)),
                ("group", models.CharField(default="unstarted", max_length=20, choices=[
                    ("backlog", "Backlog"), ("unstarted", "Unstarted"), ("started", "Started"),
                    ("completed", "Completed"), ("cancelled", "Cancelled"), ("triage", "Triage"),
                ])),
                ("sequence", models.PositiveIntegerField(default=1000)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("workspace", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="izclick_production_statuses", to="db.workspace")),
            ],
            options={"db_table": "izclick_production_statuses", "ordering": ("sequence", "created_at")},
        ),
        migrations.CreateModel(
            name="IzClickProductionStatusBinding",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("status", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="project_bindings", to="db.izclickproductionstatus")),
                ("project", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="izclick_status_bindings", to="db.project")),
                ("plane_state", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="izclick_workspace_bindings", to="db.state")),
            ],
            options={"db_table": "izclick_production_status_bindings"},
        ),
        migrations.AddConstraint(
            model_name="izclickproductionstatus",
            constraint=models.UniqueConstraint(fields=("workspace", "name"), name="izclick_status_unique_workspace_name"),
        ),
        migrations.AddConstraint(
            model_name="izclickproductionstatusbinding",
            constraint=models.UniqueConstraint(fields=("status", "project"), name="izclick_binding_unique_status_project"),
        ),
        migrations.AddConstraint(
            model_name="izclickproductionstatusbinding",
            constraint=models.UniqueConstraint(fields=("plane_state",), name="izclick_binding_unique_plane_state"),
        ),
    ]
