import { ASSIGNMENT_CONTROL_CLASS } from "@/components/issues/assignment-control";
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { useParams } from "react-router";
import { ManagedProducerAssignment } from "@/components/issues/coordinator-producer-select";
import { observer } from "mobx-react";
// types
import type { TIssue } from "@plane/types";
// components
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";

type Props = {
  issue: TIssue;
  onClose: () => void;
  onChange: (issue: TIssue, data: Partial<TIssue>, updates: any) => void;
  disabled: boolean;
};

export const SpreadsheetAssigneeColumn = observer(function SpreadsheetAssigneeColumn(props: Props) {
  const { issue, onChange, disabled, onClose } = props;
  const { workspaceSlug } = useParams();

  return (
    <div className="h-11 border-b-[0.5px] border-subtle px-1 py-1">
      <ManagedProducerAssignment slug={String(workspaceSlug ?? "")} issueId={issue.id} disabled={disabled}>
      <MemberDropdown
        value={issue?.assignee_ids ?? []}
        onChange={(data) => {
          onChange(
            issue,
            { assignee_ids: data },
            {
              changed_property: "assignees",
              change_details: data,
            }
          );
        }}
        projectId={issue?.project_id ?? undefined}
        disabled={disabled}
        multiple
        placeholder="Seleccionar productor"
        dropdownArrow
        hideIcon
        showUserDetails
        buttonVariant="transparent-with-text"
        buttonClassName={`${ASSIGNMENT_CONTROL_CLASS} !justify-between !gap-2 !px-2 !text-xs [&_span]:text-xs [&_span]:font-normal group-[.selected-issue-row]:bg-accent-primary/5 group-[.selected-issue-row]:hover:bg-accent-primary/10`}
        buttonContainerClassName="w-full"
        optionsClassName="z-[9]"
        onClose={onClose}
      />
      </ManagedProducerAssignment>
    </div>
  );
});
