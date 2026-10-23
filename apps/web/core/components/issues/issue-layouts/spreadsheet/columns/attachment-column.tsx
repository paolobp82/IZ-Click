/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// types
import { EIssueServiceType, EIssuesStoreType } from "@plane/types";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import type { TIssue } from "@plane/types";
import { IssueAttachmentCell } from "@/components/issues/attachment/attachment-cell";

type Props = {
  issue: TIssue;
};

export const SpreadsheetAttachmentColumn = observer(function SpreadsheetAttachmentColumn(props: Props) {
  const { issue } = props;

  const storeType = useIssueStoreType();
  return <IssueAttachmentCell issue={issue} serviceType={storeType === EIssuesStoreType.EPIC ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES} />;
});
