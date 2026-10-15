/**
 * Single source of truth for IZ-Click project List column widths.
 * The name, native issue properties and production metadata share one grid.
 */
export const LIST_COLUMNS = [
  { id: "state", name: "Estado", width: 260 },
  { id: "priority", name: "Prioridad", width: 150 },
  { id: "assignee", name: "Responsable", width: 144 },
  { id: "due", name: "Vencimiento", width: 144 },
  { id: "client", name: "Cliente", width: 160 },
  { id: "event", name: "Fecha del evento", width: 160 },
  { id: "sig", name: "Código SIG", width: 160 },
] as const;

export type ListColumnId = (typeof LIST_COLUMNS)[number]["id"];
export type ListColumnPreferences = Record<ListColumnId, { width: number; visible: boolean }>;

export const LIST_NAME_WIDTH = 420;

export function getListColumnLayout(prefs: ListColumnPreferences) {
  let propertiesWidth = 0;
  let metadataWidth = 0;
  const widths = {} as Record<ListColumnId, number>;
  for (const column of LIST_COLUMNS) {
    const entry = prefs[column.id];
    const width = entry.visible ? entry.width : 0;
    widths[column.id] = width;
    if (column.id === "client" || column.id === "event" || column.id === "sig") {
      metadataWidth += width;
    } else {
      propertiesWidth += width;
    }
  }
  const linkWidth = LIST_NAME_WIDTH + propertiesWidth;
  return {
    widths,
    propertiesWidth,
    metadataWidth,
    linkWidth,
    rowWidth: linkWidth + metadataWidth,
  };
}
