export const PRODUCTION_COLUMNS = [
  { id: "project", label: "Proyecto" },
  { id: "client", label: "Cliente" },
  { id: "state", label: "Estado" },
  { id: "priority", label: "Prioridad" },
  { id: "targetDate", label: "Fecha prevista" },
  { id: "eventDate", label: "Fecha del evento" },
  { id: "sig", label: "Código SIG" },
] as const;

export type ProductionColumnId = (typeof PRODUCTION_COLUMNS)[number]["id"];
export type ProductionColumnVisibility = Record<ProductionColumnId, boolean>;

export function defaultProductionColumns(): ProductionColumnVisibility {
  return { project: true, client: true, state: true, priority: true, targetDate: true, eventDate: true, sig: true };
}

export function parseProductionColumns(value: unknown): ProductionColumnVisibility {
  const defaults = defaultProductionColumns();
  if (value === null || typeof value !== "object" || Array.isArray(value)) return defaults;
  const record = value as Record<string, unknown>;
  for (const column of PRODUCTION_COLUMNS) {
    if (typeof record[column.id] === "boolean") defaults[column.id] = record[column.id] as boolean;
  }
  return defaults;
}
