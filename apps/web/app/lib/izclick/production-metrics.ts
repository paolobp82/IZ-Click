/**
 * IZ-Click Production metrics. Pure, permission-agnostic aggregation: the caller
 * must pass only the work items the logged-in user is authorised to access.
 * A "carga" is a top-level issue; subtasks do not count as separate cargas.
 */
export type ProductionWorkItem = {
  id: string;
  parent_id?: string | null;
  state_id?: string | null;
  assignee_ids?: readonly string[] | null;
  project_id?: string | null;
  client_id?: string | null;
  label_ids?: readonly string[] | null;
  event_date?: string | null;
};

export type ProductionState = {
  id: string;
  name: string;
  color?: string | null;
};

export type ProductionFilter = {
  producerId?: string | null;
  projectId?: string | null;
  clientId?: string | null;
};

export type ProductionSlice = {
  id: string;
  name: string;
  color: string;
  count: number;
  percent: number;
};

export type ProductionMetrics = {
  total: number;
  slices: ProductionSlice[];
};

/** Largest-remainder rounding so percentages always total 100 when total > 0. */
export function calculateProductionMetrics(
  issues: readonly ProductionWorkItem[],
  states: readonly ProductionState[],
  filter: ProductionFilter = {}
): ProductionMetrics {
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  const stateLookup = new Map(states.map((state) => [state.id, state]));
  let total = 0;

  for (const issue of issues) {
    if (!issue?.id || seen.has(issue.id) || issue.parent_id) continue;
    seen.add(issue.id);
    if (filter.producerId && !issue.assignee_ids?.includes(filter.producerId)) continue;
    if (filter.projectId && issue.project_id !== filter.projectId) continue;
    if (filter.clientId && issue.client_id !== filter.clientId && !issue.label_ids?.includes(filter.clientId)) continue;
    total += 1;
    const stateId = issue.state_id && stateLookup.has(issue.state_id) ? issue.state_id : "__unknown__";
    counts.set(stateId, (counts.get(stateId) ?? 0) + 1);
  }

  if (total === 0) return { total: 0, slices: [] };

  const rows = [...counts.entries()].map(([id, count], index) => {
    const state = stateLookup.get(id);
    const exact = (count * 100) / total;
    return {
      id,
      name: state?.name ?? "Sin estado",
      color: state?.color || "#94a3b8",
      count,
      floor: Math.floor(exact),
      remainder: exact - Math.floor(exact),
      index,
    };
  });

  const allocated = rows.reduce((sum, row) => sum + row.floor, 0);
  const ranked = [...rows].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < 100 - allocated; i++) ranked[i].floor += 1;

  return {
    total,
    slices: rows.map(({ id, name, color, count, floor }) => ({
      id,
      name,
      color,
      count,
      percent: floor,
    })),
  };
}
