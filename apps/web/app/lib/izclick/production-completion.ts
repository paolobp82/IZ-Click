type WorkflowState = { id: string; group: string; default?: boolean; sequence?: number };

/** Completion follows the native workflow; cancelled tasks are never completed. */
export function completionTarget(states: WorkflowState[], completed: boolean): string | null {
  const candidates = states.filter(state => completed
    ? state.group === "completed"
    : state.group === "unstarted" || state.group === "backlog");
  candidates.sort((a, b) => Number(Boolean(b.default)) - Number(Boolean(a.default)) || (a.sequence ?? 0) - (b.sequence ?? 0) || a.id.localeCompare(b.id));
  return candidates[0]?.id ?? null;
}
