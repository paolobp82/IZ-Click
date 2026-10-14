/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * IZ-Click: fixed-width, editable native Plane property columns in project List.
 * Uses the original issue store update handler and permission checks.
 */
import type { TIssue } from "@plane/types";
import { getDate, renderFormattedPayloadDate } from "@plane/utils";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { DateDropdown } from "@/components/dropdowns/date";

type Props = {
  issue: TIssue;
  canEdit: boolean;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
};

const stopLinkNavigation = (event: React.SyntheticEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

export function ProductionListPropertyColumns({ issue, canEdit, updateIssue }: Props) {
  const disabled = !canEdit || !updateIssue;
  const save = async (data: Partial<TIssue>) => {
    if (!canEdit || !updateIssue) return;
    await updateIssue(issue.project_id, issue.id, data);
  };

  return (
    <div className="flex shrink-0 items-stretch text-xs" onClick={stopLinkNavigation} onFocus={(event) => event.stopPropagation()}>
      <div className="flex min-h-11 min-w-0 shrink-0 items-center overflow-hidden border-l border-subtle px-2" style={{ display: "var(--izclick-show-state, flex)", width: "var(--izclick-col-state, 144px)" }}>
        <StateDropdown
          projectId={issue.project_id ?? undefined}
          value={issue.state_id}
          onChange={(state_id) => void save({ state_id })}
          disabled={disabled}
          buttonVariant="transparent-with-text"
          buttonContainerClassName="w-full min-w-0"
          buttonClassName="w-full truncate text-left"
        />
      </div>
      <div className="flex min-h-11 min-w-0 shrink-0 items-center overflow-hidden border-l border-subtle px-2" style={{ display: "var(--izclick-show-priority, flex)", width: "var(--izclick-col-priority, 112px)" }}>
        <PriorityDropdown
          value={issue.priority}
          onChange={(priority) => void save({ priority })}
          disabled={disabled}
          buttonVariant="transparent-with-text"
          buttonContainerClassName="w-full min-w-0"
          buttonClassName="w-full truncate text-left"
        />
      </div>
      <div className="flex min-h-11 min-w-0 shrink-0 items-center overflow-hidden border-l border-subtle px-2" style={{ display: "var(--izclick-show-assignee, flex)", width: "var(--izclick-col-assignee, 144px)" }}>
        <MemberDropdown
          projectId={issue.project_id ?? undefined}
          value={issue.assignee_ids ?? []}
          onChange={(assignee_ids) => void save({ assignee_ids })}
          disabled={disabled}
          multiple
          placeholder="Responsable"
          buttonVariant="transparent-with-text"
          buttonContainerClassName="w-full min-w-0"
          buttonClassName="w-full truncate text-left"
        />
      </div>
      <div className="flex min-h-11 min-w-0 shrink-0 items-center overflow-hidden border-l border-subtle px-2" style={{ display: "var(--izclick-show-due, flex)", width: "var(--izclick-col-due, 144px)" }}>
        <DateDropdown
          value={issue.target_date}
          minDate={getDate(issue.start_date)}
          onChange={(date) => void save({ target_date: date ? renderFormattedPayloadDate(date) : null })}
          disabled={disabled}
          placeholder="Vencimiento"
          buttonVariant="transparent-with-text"
          buttonContainerClassName="w-full min-w-0"
          buttonClassName="w-full truncate text-left"
        />
      </div>
    </div>
  );
}
