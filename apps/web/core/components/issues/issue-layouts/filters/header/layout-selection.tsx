/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { ISSUE_LAYOUTS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import { EIssueLayoutTypes } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { IssueLayoutIcon } from "@/components/issues/issue-layouts/layout-icon";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";

const IZCLICK_LAYOUT_LABELS: Partial<Record<EIssueLayoutTypes, string>> = {
  [EIssueLayoutTypes.LIST]: "Lista",
  [EIssueLayoutTypes.SPREADSHEET]: "Tabla",
  [EIssueLayoutTypes.KANBAN]: "Tablero",
  [EIssueLayoutTypes.CALENDAR]: "Calendario",
  [EIssueLayoutTypes.GANTT]: "Gantt",
};

const IZCLICK_LAYOUT_ORDER = [
  EIssueLayoutTypes.LIST,
  EIssueLayoutTypes.SPREADSHEET,
  EIssueLayoutTypes.KANBAN,
  EIssueLayoutTypes.CALENDAR,
  EIssueLayoutTypes.GANTT,
];

type Props = {
  layouts: EIssueLayoutTypes[];
  onChange: (layout: EIssueLayoutTypes) => void;
  selectedLayout: EIssueLayoutTypes | undefined;
};

export function LayoutSelection(props: Props) {
  const { layouts, onChange, selectedLayout } = props;
  const { isMobile } = usePlatformOS();
  const { t } = useTranslation();
  const availableLayouts = IZCLICK_LAYOUT_ORDER.filter((layout) => layouts.includes(layout));
  const handleOnChange = (layoutKey: EIssueLayoutTypes) => {
    if (selectedLayout !== layoutKey) {
      onChange(layoutKey);
    }
  };

  return (
    <nav aria-label="Vistas de cargas" className="flex max-w-full items-center gap-1 overflow-x-auto rounded-md bg-layer-3 p-1">
      {availableLayouts.map((layoutKey) => {
        const layout = ISSUE_LAYOUTS.find((item) => item.key === layoutKey);
        if (!layout) return null;
        const label = IZCLICK_LAYOUT_LABELS[layoutKey] ?? t(layout.i18n_title);
        return (
        <Tooltip key={layout.key} tooltipContent={label} isMobile={isMobile}>
          <button
            type="button"
            aria-pressed={selectedLayout === layout.key}
            aria-label={label}
            className={cn(
              "group inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-2 text-xs transition-colors hover:bg-layer-transparent-hover",
              {
                "bg-layer-transparent-active font-semibold text-primary": selectedLayout === layout.key,
              }
            )}
            onClick={() => handleOnChange(layout.key)}
          >
            <IssueLayoutIcon
              layout={layout.key}
              size={14}
              strokeWidth={2}
              className={`size-3.5 ${selectedLayout == layout.key ? "text-primary" : "text-secondary"}`}
            />
            <span>{label}</span>
          </button>
        </Tooltip>
        );
      })}
    </nav>
  );
}
