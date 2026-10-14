import type { ProductionWorkItem } from "./production-metrics";

export type ScheduledLoad = {
  id: string;
  project_id: string;
  name: string;
  date: string;
  source: "event_date" | "target_date";
  priority: string;
  client_id: string | null;
};
const isoDate = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export function validCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !isoDate.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const actual = new Date(Date.UTC(year, month - 1, day));
  return actual.getUTCFullYear() === year && actual.getUTCMonth() === month - 1 && actual.getUTCDate() === day;
}

/** Calendar includes only visible top-level issues with a valid native date. */
export function scheduledProductionLoads(issues: readonly ProductionWorkItem[]): ScheduledLoad[] {
  const seen = new Set<string>();
  const result: ScheduledLoad[] = [];
  for (const issue of issues) {
    if (!issue?.id || !issue.project_id || issue.parent_id || seen.has(issue.id)) continue;
    seen.add(issue.id);
    const date = validCalendarDate(issue.event_date) ? issue.event_date
      : validCalendarDate(issue.target_date) ? issue.target_date : null;
    if (!date) continue;
    result.push({
      id: issue.id,
      project_id: issue.project_id,
      name: issue.name?.trim() || "Carga sin nombre",
      date,
      source: validCalendarDate(issue.event_date) ? "event_date" : "target_date",
      priority: issue.priority || "none",
      client_id: issue.client_id || null,
    });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "es"));
}
