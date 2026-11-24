/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { ALL_ISSUES, EIssueFilterType, EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import type { EIssuesStoreType, IIssueDisplayFilterOptions, TIssueOrderByOptions } from "@plane/types";
import { EIssueLayoutTypes } from "@plane/types";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useUserPermissions } from "@/hooks/store/user";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { useIssuesActions } from "@/hooks/use-issues-actions";
// local imports
import { IssueLayoutHOC } from "../issue-layout-HOC";
import type { IQuickActionProps, TRenderQuickActions } from "../list/list-view-types";
import { SpreadsheetView } from "./spreadsheet-view";

export type SpreadsheetStoreType =
  | EIssuesStoreType.PROJECT
  | EIssuesStoreType.MODULE
  | EIssuesStoreType.CYCLE
  | EIssuesStoreType.PROJECT_VIEW
  | EIssuesStoreType.TEAM
  | EIssuesStoreType.TEAM_VIEW
  | EIssuesStoreType.EPIC;

interface IBaseSpreadsheetRoot {
  QuickActions: FC<IQuickActionProps>;
  canEditPropertiesBasedOnProject?: (projectId: string) => boolean;
  isCompletedCycle?: boolean;
  viewId?: string | undefined;
  isEpic?: boolean;
  paginated?: boolean;
}

export const BaseSpreadsheetRoot = observer(function BaseSpreadsheetRoot(props: IBaseSpreadsheetRoot) {
  const {
    QuickActions,
    canEditPropertiesBasedOnProject,
    isCompletedCycle = false,
    viewId,
    isEpic = false,
    paginated = false,
  } = props;
  // router
  const { projectId } = useParams();
  // store hooks
  const storeType = useIssueStoreType() as SpreadsheetStoreType;
  const { allowPermissions } = useUserPermissions();
  const { issues, issuesFilter } = useIssues(storeType);
  const filterKey = JSON.stringify([projectId, storeType, viewId, paginated ? issuesFilter.appliedFilters : null]);
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const [pageError, setPageError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [tableOrder, setTableOrder] = useState<TIssueOrderByOptions>("-created_at");
  const {
    fetchIssues,
    fetchNextIssues,
    quickAddIssue,
    updateIssue,
    removeIssue,
    removeIssueFromView,
    archiveIssue,
    restoreIssue,
    updateFilters,
  } = useIssuesActions(storeType);
  // derived values
  const { enableInlineEditing, enableQuickAdd, enableIssueCreation } = issues?.viewFlags || {};
  // user role validation
  const isEditingAllowed = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  useEffect(() => {
    let active = true;
    setPageError("");
    void fetchIssues(
      "init-loader",
      {
        canGroup: false,
        perPageCount: paginated ? 50 : 100,
        ...(paginated ? { page, orderBy: tableOrder } : {}),
      },
      viewId
    ).catch(() => {
      if (active) setPageError("No se pudo cargar esta página. Vuelve a intentarlo.");
    });
    return () => {
      active = false;
    };
  }, [fetchIssues, storeType, viewId, paginated, page, filterKey, attempt, tableOrder]);

  const canEditProperties = useCallback(
    (targetProjectId: string | undefined) => {
      const isEditingAllowedBasedOnProject =
        canEditPropertiesBasedOnProject && targetProjectId
          ? canEditPropertiesBasedOnProject(targetProjectId)
          : isEditingAllowed;

      return enableInlineEditing && isEditingAllowedBasedOnProject;
    },
    [canEditPropertiesBasedOnProject, enableInlineEditing, isEditingAllowed]
  );

  const issueIds = issues.groupedIssueIds?.[ALL_ISSUES] ?? [];
  const nextPageResults = issues.getPaginationData(ALL_ISSUES, undefined)?.nextPageResults;
  const total = issues.getGroupIssueCount(ALL_ISSUES, undefined, false);
  const loading = !!issues.getIssueLoader();
  useEffect(() => {
    if (!paginated || loading || total === undefined) return;
    const lastPage = Math.max(1, Math.ceil(total / 50));
    if (page > lastPage) setPageState({ key: filterKey, page: lastPage });
  }, [paginated, loading, total, page, filterKey]);

  const handleDisplayFiltersUpdate = useCallback(
    (updatedDisplayFilter: Partial<IIssueDisplayFilterOptions>) => {
      if (paginated && updatedDisplayFilter.order_by) setTableOrder(updatedDisplayFilter.order_by);
      updateFilters(projectId?.toString() ?? "", EIssueFilterType.DISPLAY_FILTERS, {
        ...updatedDisplayFilter,
      });
    },
    [projectId, updateFilters, paginated]
  );

  const renderQuickActions: TRenderQuickActions = useCallback(
    ({ issue, parentRef, customActionButton, placement, portalElement }) => (
      <QuickActions
        parentRef={parentRef}
        customActionButton={customActionButton}
        issue={issue}
        handleDelete={async () => removeIssue(issue.project_id, issue.id)}
        handleUpdate={async (data) => updateIssue && updateIssue(issue.project_id, issue.id, data)}
        handleRemoveFromView={async () => removeIssueFromView && removeIssueFromView(issue.project_id, issue.id)}
        handleArchive={async () => archiveIssue && archiveIssue(issue.project_id, issue.id)}
        handleRestore={async () => restoreIssue && restoreIssue(issue.project_id, issue.id)}
        portalElement={portalElement}
        readOnly={!canEditProperties(issue.project_id ?? undefined) || isCompletedCycle}
        placements={placement}
      />
    ),
    [
      QuickActions,
      isCompletedCycle,
      canEditProperties,
      removeIssue,
      updateIssue,
      removeIssueFromView,
      archiveIssue,
      restoreIssue,
    ]
  );

  if (pageError)
    return (
      <div role="alert" className="p-6">
        {pageError}
        <button type="button" className="ml-3 underline" onClick={() => setAttempt((value) => value + 1)}>
          Reintentar
        </button>
      </div>
    );
  if (!Array.isArray(issueIds)) return null;

  return (
    <IssueLayoutHOC layout={EIssueLayoutTypes.SPREADSHEET}>
      <SpreadsheetView
        displayProperties={issuesFilter.issueFilters?.displayProperties ?? {}}
        displayFilters={{
          ...issuesFilter.issueFilters?.displayFilters,
          ...(paginated ? { order_by: tableOrder } : {}),
        }}
        handleDisplayFilterUpdate={handleDisplayFiltersUpdate}
        issueIds={issueIds}
        quickActions={renderQuickActions}
        updateIssue={updateIssue}
        canEditProperties={canEditProperties}
        quickAddCallback={quickAddIssue}
        enableQuickCreateIssue={enableQuickAdd}
        disableIssueCreation={!enableIssueCreation || !isEditingAllowed || isCompletedCycle}
        canLoadMoreIssues={!!nextPageResults}
        loadMoreIssues={fetchNextIssues}
        isEpic={isEpic}
        pagination={
          paginated
            ? {
                page,
                pageSize: 50,
                newestFirst: tableOrder === "-created_at",
                total: total ?? 0,
                loading,
                error: pageError,
                onPageChange: (next) => setPageState({ key: filterKey, page: next }),
              }
            : undefined
        }
      />
    </IssueLayoutHOC>
  );
});
