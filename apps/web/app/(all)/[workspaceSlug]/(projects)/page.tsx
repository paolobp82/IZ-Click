/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "react-router";
// components
import { useTranslation } from "@plane/i18n";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { WorkspaceHomeView } from "@/components/home";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
// local components
import { WorkspaceDashboardHeader } from "./header";

function WorkspaceDashboardPage() {
  const { workspaceSlug } = useParams();
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();
  // derived values
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace?.name} - ${t("home.title")}` : undefined;

  return (
    <>
      <AppHeader header={<WorkspaceDashboardHeader />} />
      <ContentWrapper>
        <PageHead title={pageTitle} />
        <div className="flex justify-end border-b border-subtle px-4 py-2">
          <a href={`/${encodeURIComponent(workspaceSlug || "")}/produccion`} className="rounded-md border border-subtle px-3 py-1.5 text-sm">
            Control global de Producción
          </a>
        </div>
        <WorkspaceHomeView />
      </ContentWrapper>
    </>
  );
}

export default observer(WorkspaceDashboardPage);
