type WorkflowState = { id: string; name?: string; group: string; default?: boolean; sequence?: number };

/** The checkbox completes work; approval remains a separate workflow state. */
export function completionTarget(states: WorkflowState[], completed: boolean): string | null {
  const candidates = states.filter(state => completed
    ? state.group === "completed" && state.name?.trim().toLocaleLowerCase("es") === "completado"
    : state.group === "unstarted" || state.group === "backlog");
  candidates.sort((a, b) => Number(Boolean(b.default)) - Number(Boolean(a.default)) || (a.sequence ?? 0) - (b.sequence ?? 0) || a.id.localeCompare(b.id));
  return candidates[0]?.id ?? null;
}
