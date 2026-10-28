type WorkflowState = { id: string; name?: string; group: string; default?: boolean; sequence?: number };

export function isCompletionState(state: { name?: string } | undefined): boolean {
  return state?.name?.trim().toLocaleLowerCase("es") === "completado";
}

/** Users choose states by name; native workflow categories are implementation details. */
export function completionTarget(states: WorkflowState[], completed: boolean): string | null {
  const candidates = states.filter(state => completed
    ? isCompletionState(state)
    : !isCompletionState(state));
  candidates.sort((a, b) => Number(Boolean(b.default)) - Number(Boolean(a.default)) || (a.sequence ?? 0) - (b.sequence ?? 0) || a.id.localeCompare(b.id));
  return candidates[0]?.id ?? null;
}
