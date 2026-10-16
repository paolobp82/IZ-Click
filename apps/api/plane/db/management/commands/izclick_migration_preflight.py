"""Generate the Izclick custom-field migration against this checkout's real graph.

Run in a development Django environment:
    python manage.py makemigrations db --name izclick_custom_fields
    python manage.py migrate db --plan

Do not execute 'migrate' against production before approval.
This command checks the models and current leaf nodes without assuming
a migration number or silently modifying a database.
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import connections
from django.db.migrations.loader import MigrationLoader


class Command(BaseCommand):
    help = "Inspect the current Plane db migration leaf for IZ-Click."

    def handle(self, *args, **options):
        loader = MigrationLoader(connections["default"], load=True)
        leaves = [node for node in loader.graph.leaf_nodes() if node[0] == "db"]
        if len(leaves) != 1:
            raise CommandError(
                "Expected one db migration leaf; resolve conflicting branches first: " + repr(leaves)
            )
        self.stdout.write("Current db migration leaf: " + repr(leaves[0]))
        self.stdout.write("Generate the migration with: python manage.py makemigrations db --name izclick_custom_fields")
        self.stdout.write("Review the file and inspect: python manage.py migrate db --plan")
        self.stdout.write("Do not run migrate on production.")
