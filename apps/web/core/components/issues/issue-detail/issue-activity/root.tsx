/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useEffect, useRef } from "react";
import uniq from "lodash-es/uniq";
import { observer } from "mobx-react";
// plane package imports
import type { TActivityFilters } from "@plane/constants";
import { E_SORT_ORDER, defaultActivityFilters } from "@plane/constants";
import { useLocalStorage } from "@plane/hooks";
// i18n
import { useTranslation } from "@plane/i18n";
//types
import type { TFileSignedURLResponse, TIssueComment } from "@plane/types";
// components
import { CommentCreate } from "@/components/comments/comment-create";
// hooks
import { useProject } from "@/hooks/store/use-project";
// local imports
import { IssueActivityCommentRoot } from "./activity-comment-root";
import { useWorkItemCommentOperations } from "./helper";
import { ActivitySortRoot } from "./sort-root";
import { ActivityFilterRoot } from "./filter-root";

type TIssueActivity = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  isIntakeIssue?: boolean;
};

export type TActivityOperations = {
  createComment: (data: Partial<TIssueComment>) => Promise<TIssueComment>;
  updateComment: (commentId: string, data: Partial<TIssueComment>) => Promise<void>;
  removeComment: (commentId: string) => Promise<void>;
  uploadCommentAsset: (blockId: string, file: File, commentId?: string) => Promise<TFileSignedURLResponse>;
};

export const IssueActivity = observer(function IssueActivity(props: TIssueActivity) {
  const { workspaceSlug, projectId, issueId, disabled = false, isIntakeIssue = false } = props;
  const chatRef = useRef<HTMLDivElement>(null);
  const chatContentsRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  useEffect(() => {
    followLatest.current = true;
    const observer = new ResizeObserver(() => {
      const feed = chatRef.current;
      if (feed && followLatest.current) feed.scrollTop = feed.scrollHeight;
    });
    if (chatContentsRef.current) observer.observe(chatContentsRef.current);
    return () => observer.disconnect();
  }, [issueId]);
  // i18n
  const { t } = useTranslation();
  // hooks
  const { setValue: setFilterValue, storedValue: selectedFilters } = useLocalStorage(
    "issue_activity_filters",
    defaultActivityFilters
  );
  const { setValue: setSortOrder, storedValue: sortOrder } = useLocalStorage("activity_sort_order", E_SORT_ORDER.ASC);

  const { getProjectById } = useProject();

  // toggle filter
  const toggleFilter = (filter: TActivityFilters) => {
    if (!selectedFilters) return;
    let _filters = [];
    if (selectedFilters.includes(filter)) {
      if (selectedFilters.length === 1) return selectedFilters; // Ensure at least one filter is applied
      _filters = selectedFilters.filter((f) => f !== filter);
    } else {
      _filters = [...selectedFilters, filter];
    }

    setFilterValue(uniq(_filters));
  };

  const toggleSortOrder = () => {
    setSortOrder(sortOrder === E_SORT_ORDER.ASC ? E_SORT_ORDER.DESC : E_SORT_ORDER.ASC);
  };

  // helper hooks
  const activityOperations = useWorkItemCommentOperations(workspaceSlug, projectId, issueId);

  const project = getProjectById(projectId);
  const renderCommentCreationBox = useMemo(
    () => (
      <CommentCreate
        workspaceSlug={workspaceSlug}
        entityId={issueId}
        activityOperations={activityOperations}
        onSubmitCallback={() => { followLatest.current = true; }}
        showToolbarInitially
        projectId={projectId}
      />
    ),
    [workspaceSlug, issueId, activityOperations, projectId]
  );
  if (!project) return <></>;

  return (
    <div className="grid h-[680px] min-h-0 grid-rows-[minmax(0,2fr)_minmax(0,1fr)] gap-3 lg:h-full">
      <section aria-label="Comentarios de la tarea" className="flex min-h-0 flex-col rounded border border-subtle">
        <h3 className="shrink-0 border-b border-subtle px-3 py-2 text-sm font-semibold">Comentarios</h3>
        <div ref={chatRef} data-izclick-chat-feed className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2"
          onScroll={() => { const feed = chatRef.current; if (feed) followLatest.current = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48; }}>
          <div ref={chatContentsRef}>
            <IssueActivityCommentRoot projectId={projectId} workspaceSlug={workspaceSlug} isIntakeIssue={isIntakeIssue}
              issueId={issueId} selectedFilters={defaultActivityFilters} kind="comments" activityOperations={activityOperations}
              showAccessSpecifier={!!project.anchor} disabled={disabled} sortOrder={E_SORT_ORDER.ASC} />
          </div>
        </div>
        {!disabled && <div data-izclick-chat-composer className="max-h-[45%] shrink-0 overflow-y-auto border-t border-subtle bg-surface-1 p-2">{renderCommentCreationBox}</div>}
      </section>
      <section aria-label="Actividad de la tarea" className="flex min-h-0 flex-col rounded border border-subtle">
        <header className="flex shrink-0 items-center justify-between border-b border-subtle px-3 py-2">
          <h3 className="text-sm font-semibold">Actividad</h3>
          <div className="flex items-center gap-2">
            <ActivitySortRoot sortOrder={sortOrder || E_SORT_ORDER.ASC} toggleSort={toggleSortOrder} />
            <ActivityFilterRoot selectedFilters={selectedFilters || defaultActivityFilters} toggleFilter={toggleFilter} isIntakeIssue={isIntakeIssue} projectId={projectId} />
          </div>
        </header>
        <div data-izclick-activity-feed className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
          <IssueActivityCommentRoot projectId={projectId} workspaceSlug={workspaceSlug} isIntakeIssue={isIntakeIssue}
            issueId={issueId} selectedFilters={selectedFilters || defaultActivityFilters} kind="activity"
            activityOperations={activityOperations} showAccessSpecifier={!!project.anchor} disabled={disabled} sortOrder={sortOrder || E_SORT_ORDER.ASC} />
        </div>
      </section>
    </div>
  );
});
