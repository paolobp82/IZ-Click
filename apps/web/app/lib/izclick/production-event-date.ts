/** Self-contained validation: unit tests also execute this file directly under Node ESM. */
function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const EVENT_LABEL_PREFIX = "Evento: ";
export const EVENT_LABEL_COLOR = "#6366f1";
export type PlaneLabelSummary = { id: string; name: string; color?: string | null };

export function eventDateLabelName(date: string): string {
  if (!validCalendarDate(date)) throw new Error("Fecha del evento inválida");
  return EVENT_LABEL_PREFIX + date;
}

/**
 * Interprets project-scoped Plane labels as a dedicated IZ-Click event date.
 * Ignores invalid dates and rejects competing event dates to prevent silent corruption.
 */
export function eventDateFromLabels(labels: readonly PlaneLabelSummary[], assignedIds: readonly string[]): string | null {
  const assigned = new Set(assignedIds);
  const dates = new Set<string>();
  for (const label of labels) {
    if (!assigned.has(label.id) || !label.name.startsWith(EVENT_LABEL_PREFIX)) continue;
    const date = label.name.slice(EVENT_LABEL_PREFIX.length);
    if (validCalendarDate(date)) dates.add(date);
  }
  if (dates.size > 1) throw new Error("La carga tiene dos fechas de evento: se requiere corrección manual.");
  return [...dates][0] ?? null;
}

export function mergeEventDateLabelIds(
  issueLabelIds: readonly string[],
  projectLabels: readonly PlaneLabelSummary[],
  nextDateLabelId: string | null
): string[] {
  const eventIds = new Set(projectLabels.filter((label) => label.name.startsWith(EVENT_LABEL_PREFIX)).map((label) => label.id));
  const preserved = issueLabelIds.filter((id) => !eventIds.has(id));
  return [...new Set(nextDateLabelId ? [...preserved, nextDateLabelId] : preserved)];
}

export function parseIssueLabelIds(issue: unknown): string[] {
  if (!issue || typeof issue !== "object" || (!("label_ids" in issue) && !("labels" in issue))) {
    throw new Error("Plane no devolvió las etiquetas de la carga: no se guardará para evitar pérdidas.");
  }
  const payload = issue as { label_ids?: unknown; labels?: unknown };
  const raw = payload.label_ids ?? payload.labels;
  if (!Array.isArray(raw)) throw new Error("Formato de etiquetas inesperado");
  const ids = raw.map((value) => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
    throw new Error("Una etiqueta no tiene ID válido");
  });
  return [...new Set(ids)];
}
