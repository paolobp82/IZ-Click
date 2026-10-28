import presets from "./production-workflow-presets.json" with { type: "json" };

export type ProductionStateGroup = "backlog" | "unstarted" | "started" | "completed" | "cancelled";
export type ProductionStatePreset = { name: string; group: ProductionStateGroup; color: string; sequence: number };
export const PRODUCTION_STATE_SEGMENTS: readonly { value: ProductionStateGroup; label: string }[] = [
  { value: "backlog", label: "Pendiente" },
  { value: "unstarted", label: "Por hacer" },
  { value: "started", label: "En progreso" },
  { value: "completed", label: "Completado" },
  { value: "cancelled", label: "Cancelado" },
];
export const PRODUCTION_STATES: readonly ProductionStatePreset[] = presets as ProductionStatePreset[];

/** Return fresh buckets without changing state objects or their individual colors. */
export function segmentProductionStates<T extends { group: string }>(states: readonly T[]) {
  return PRODUCTION_STATE_SEGMENTS.map(segment => ({
    ...segment, states: states.filter(state => state.group === segment.value),
  }));
}

export function normalizedStateName(value: string): string {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/\s+/g, " ");
}
export function missingProductionStates(states: readonly { name: string }[]): ProductionStatePreset[] {
  const existing = new Set(states.map((state) => normalizedStateName(state.name)));
  return PRODUCTION_STATES.filter((state) => !existing.has(normalizedStateName(state.name)));
}
