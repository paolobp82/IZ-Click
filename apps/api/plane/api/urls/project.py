# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    ProjectListCreateAPIEndpoint,
    ProjectListLiteAPIEndpoint,
    ProjectDetailAPIEndpoint,
    ProjectArchiveUnarchiveAPIEndpoint,
    ProjectSummaryAPIEndpoint,
)

from plane.api.views.izclick_coordination import (
    IzclickAccessAPI, IzclickProjectsAPI, IzclickProjectMetadataAPI, IzclickProjectCommentsAPI,
    IzclickCoordinationQueueAPI, IzclickProducerWorkloadAPI, IzclickWorkspaceRolesAPI, IzclickProjectAssignmentAPI,
)

urlpatterns = [
    path("workspaces/<str:slug>/izclick/access/", IzclickAccessAPI.as_view()),
    path("workspaces/<str:slug>/izclick/projects/", IzclickProjectsAPI.as_view()),
    path("workspaces/<str:slug>/izclick/projects/<uuid:project_id>/", IzclickProjectMetadataAPI.as_view()),
    path("workspaces/<str:slug>/izclick/projects/<uuid:project_id>/comments/", IzclickProjectCommentsAPI.as_view()),

    path(
        "workspaces/<str:slug>/izclick/roles/",
        IzclickWorkspaceRolesAPI.as_view(http_method_names=["get", "patch"]),
        name="izclick-workspace-roles",
    ),
    path(
        "workspaces/<str:slug>/izclick/coordination/",
        IzclickCoordinationQueueAPI.as_view(http_method_names=["get"]),
        name="izclick-coordination-queue",
    ),
    path(
        "workspaces/<str:slug>/izclick/workload/",
        IzclickProducerWorkloadAPI.as_view(http_method_names=["get"]),
        name="izclick-producer-workload",
    ),
    path(
        "workspaces/<str:slug>/izclick/projects/<uuid:project_id>/assign/",
        IzclickProjectAssignmentAPI.as_view(http_method_names=["post"]),
        name="izclick-project-assignment",
    ),
    path(
        "workspaces/<str:slug>/projects/",
        ProjectListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="project",
    ),
    path(
        "workspaces/<str:slug>/projects-lite/",
        ProjectListLiteAPIEndpoint.as_view(http_method_names=["get"]),
        name="project-lite",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:pk>/",
        ProjectDetailAPIEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="project",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/archive/",
        ProjectArchiveUnarchiveAPIEndpoint.as_view(http_method_names=["post", "delete"]),
        name="project-archive-unarchive",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/summary/",
        ProjectSummaryAPIEndpoint.as_view(http_method_names=["get"]),
        name="project-summary",
    ),
]
