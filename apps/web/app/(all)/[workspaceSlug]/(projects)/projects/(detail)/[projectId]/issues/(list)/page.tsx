/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { PageHead } from "@/components/core/page-title";
import { ProjectLayoutRoot } from "@/components/issues/issue-layouts/roots/project-layout-root";
import { useProject } from "@/hooks/store/use-project";
import type { Route } from "./+types/page";

/**
 * The editable native Plane layout is the single source of truth for IZ-Click.
 * No parallel panels or alternate state/issue stores are rendered on this route.
 * All five native layouts share the same issue store, actions and permissions.
 */
function ProjectIssuesPage({ params }: Route.ComponentProps) {
  const { projectId } = params;
  const { t } = useTranslation();
  const { getProjectById } = useProject();
  const project = getProjectById(projectId);
  const pageTitle = project?.name ? `${project.name} - ${t("issue.label", { count: 2 })}` : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="h-full min-h-0 w-full">
        <ProjectLayoutRoot />
      </div>
    </>
  );
}

export default observer(ProjectIssuesPage);
