export type ProductionMember = { id: string; name: string };
type Loose = Record<string, unknown>;
function asRecord(value: unknown): Loose | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Loose : null;
}
function nonempty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
/** Handles Plane workspace/project member records without exposing email addresses in the chart. */
export function normalizeProductionMembers(response: unknown): ProductionMember[] {
  const raw = Array.isArray(response) ? response : asRecord(response)?.results;
  if (!Array.isArray(raw)) throw new Error("Formato de miembros de Plane no reconocido");
  const unique = new Map<string, ProductionMember>();
  for (const item of raw) {
    const record = asRecord(item);
    if (!record) continue;
    const user = asRecord(record.member) ?? asRecord(record.user) ?? record;
    const id = nonempty(user.id) ?? nonempty(record.member_id) ?? nonempty(record.user_id);
    if (!id) continue;
    const display = nonempty(user.display_name)
      ?? [nonempty(user.first_name), nonempty(user.last_name)].filter(Boolean).join(" ")
      ?? null;
    const name = display || nonempty(user.username) || `Usuario ${id.slice(0, 8)}`;
    unique.set(id, { id, name });
  }
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}
