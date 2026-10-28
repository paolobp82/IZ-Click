"""Additional synthetic data. Never run against any database except izclick_qa."""
import base64
import json
import os
import uuid

import boto3
from django.conf import settings
from plane.db.models import FileAsset, Issue, User

assert settings.DATABASES['default']['NAME'] == 'izclick_qa'
assert os.environ.get('APP_BASE_URL') == 'http://127.0.0.1:38080'
parent = Issue.objects.get(workspace__slug='izclick-qa', name__startswith='Carga QA montaje')
child = Issue.objects.create(workspace=parent.workspace, project=parent.project, state=parent.state,
                             parent=parent, name='Subtarea Sprint 1 QA')
Issue.objects.create(workspace=parent.workspace, project=parent.project, state=parent.state,
                     parent=child, name='Subtarea anidada Sprint 1 QA')
s3 = boto3.client('s3', endpoint_url=os.environ['AWS_S3_ENDPOINT_URL'],
                  aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
                  aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'], region_name='us-east-1')
bucket = os.environ['AWS_S3_BUCKET_NAME']
s3.create_bucket(Bucket=bucket)
s3.put_bucket_cors(Bucket=bucket, CORSConfiguration={'CORSRules': [{'AllowedMethods': ['GET', 'HEAD', 'POST'],
    'AllowedOrigins': ['http://127.0.0.1:38080'], 'AllowedHeaders': ['*']}]})
png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9S0AAAAASUVORK5CYII=')
for name, content, kind in [('Montaje-QA.png', png, 'image/png'),
                             ('Reporte-QA.txt', b'IZCLICK Sprint 1: descarga verificada.\n', 'text/plain')]:
    key = f'{parent.workspace_id}/{uuid.uuid4().hex}-{name}'
    s3.put_object(Bucket=bucket, Key=key, Body=content, ContentType=kind)
    FileAsset.objects.create(workspace=parent.workspace, project=parent.project, issue=parent,
        entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT, entity_identifier=str(parent.pk),
        asset=key, attributes={'name': name, 'size': len(content), 'type': kind},
        size=len(content), is_uploaded=True, created_by=parent.created_by)
print('Sprint 1 synthetic subtasks and storage objects seeded')
