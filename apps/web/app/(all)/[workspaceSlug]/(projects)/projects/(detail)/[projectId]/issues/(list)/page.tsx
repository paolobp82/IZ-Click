/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// i18n
import { useTranslation } from "@plane/i18n";
// components
import { PageHead } from "@/components/core/page-title";
import { ProductionProjectPanel } from "@/components/izclick/production-project-panel";
import { ProjectLayoutRoot } from "@/components/issues/issue-layouts/roots/project-layout-root";
// hooks
import { useProject } from "@/hooks/store/use-project";
import type { Route } from "./+types/page";

function ProjectIssuesPage({ params }: Route.ComponentProps) {
  const { projectId, workspaceSlug } = params;
  const [showProduction, setShowProduction] = useState(false);
  // i18n
  const { t } = useTranslation();
  // store
  const { getProjectById } = useProject();

  // derived values
  const project = getProjectById(projectId);
  const pageTitle = project?.name ? `${project?.name} - ${t("issue.label", { count: 2 })}` : undefined; // Count is for pluralization

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="flex h-full w-full flex-col">
        <div className="flex justify-end border-b border-subtle px-4 py-2">
          <button
            type="button"
            aria-pressed={showProduction}
            onClick={() => setShowProduction((value) => !value)}
            className="rounded-md border border-subtle px-3 py-1.5 text-sm"
          >
            {showProduction ? "Volver a tareas" : "Control de cargas"}
          </button>
        </div>
        {showProduction ? (
          <div className="h-full overflow-y-auto">
            <ProductionProjectPanel
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              projectName={project?.name}
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            <ProjectLayoutRoot />
          </div>
        )}
      </div>
    </>
  );
}

export default observer(ProjectIssuesPage);
