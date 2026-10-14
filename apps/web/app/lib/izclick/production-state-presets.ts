/** Proposed Izango Production workflow; additive configuration only. */
export const PRODUCTION_STATES = [
  { name: "Por cotizar", group: "backlog", color: "#64748b" },
  { name: "Pendiente de aprobación", group: "unstarted", color: "#eab308" },
  { name: "Aprobado", group: "started", color: "#0ea5e9" },
  { name: "Rechazado", group: "cancelled", color: "#ef4444" },
  { name: "En producción", group: "started", color: "#8b5cf6" },
  { name: "Finalizado", group: "completed", color: "#22c55e" },
] as const;
export type ProductionStatePreset = { name: string; group: string; color: string };
export function normalizedStateName(value: string): string {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/\s+/g, " ");
}
export function missingProductionStates(states: readonly { name: string }[]): ProductionStatePreset[] {
  const existing = new Set(states.map((state) => normalizedStateName(state.name)));
  return PRODUCTION_STATES.filter((state) => !existing.has(normalizedStateName(state.name)));
}
