import type { ProductionState, ProductionWorkItem } from "./production-metrics";

/**
 * Normalize project work items returned by Plane CE.
 * Plane's issue API commonly exposes `state`, `assignees`, and `parent`;
 * IZ-Click charts only consume the normalized shape.
 */
type ApiIssue = Record<string, unknown>;
type ApiState = Record<string, unknown>;

function idOf(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id: unknown }).id;
    return typeof id === "string" && id.trim() ? id : null;
  }
  return null;
}

function idsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(idOf).filter((id): id is string => Boolean(id))));
}

export function normalizePlaneIssue(item: ApiIssue): ProductionWorkItem | null {
  const id = idOf(item.id);
  if (!id) return null;
  return {
    id,
    sequence_id: typeof item.sequence_id === "number" && Number.isSafeInteger(item.sequence_id) && item.sequence_id > 0 ? item.sequence_id : null,
    parent_id: idOf(item.parent_id ?? item.parent),
    state_id: idOf(item.state_id ?? item.state),
    assignee_ids: idsOf(item.assignee_ids ?? item.assignees),
    project_id: idOf(item.project_id ?? item.project),
    client_id: idOf(item.client_id),
    label_ids: idsOf(item.label_ids ?? item.labels),
    event_date: typeof item.event_date === "string" ? item.event_date : null,
    target_date: typeof item.target_date === "string" ? item.target_date : null,
    name: typeof item.name === "string" ? item.name : null,
    priority: typeof item.priority === "string" ? item.priority : null,
  };
}

export function normalizePlaneState(item: ApiState): ProductionState | null {
  const id = idOf(item.id);
  if (!id) return null;
  return {
    id,
    name: typeof item.name === "string" && item.name.trim() ? item.name : "Sin nombre",
    color: typeof item.color === "string" ? item.color : null,
  };
}

export function normalizePlaneCollection<T>(
  response: unknown,
  normalize: (item: Record<string, unknown>) => T | null
): T[] {
  const list =
    Array.isArray(response) ? response :
    response && typeof response === "object" && "results" in response
      ? (response as { results: unknown }).results :
      null;
  if (!Array.isArray(list)) throw new Error("Respuesta de Plane con estructura inesperada");
  return list.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = normalize(value as Record<string, unknown>);
    return item ? [item] : [];
  });
}
