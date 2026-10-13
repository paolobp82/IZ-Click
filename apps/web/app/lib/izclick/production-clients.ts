export type ProductionClient = { id: string; name: string; color: string };
type Raw = Record<string, unknown>;

/** Native Plane labels named "Cliente: <nombre>" represent clients for the pilot. */
export function clientsFromPlaneLabels(payload: unknown): ProductionClient[] {
  const raw = Array.isArray(payload) ? payload
    : payload && typeof payload === "object" && "results" in payload
      ? (payload as { results: unknown }).results : null;
  if (!Array.isArray(raw)) throw new Error("Respuesta de etiquetas inesperada");
  const byId = new Map<string, ProductionClient>();
  for (const value of raw) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const label = value as Raw;
    if (typeof label.id !== "string" || typeof label.name !== "string") continue;
    const matched = /^cliente\s*:\s*(.+)$/i.exec(label.name.trim());
    if (!matched || !matched[1]?.trim()) continue;
    byId.set(label.id, {
      id: label.id,
      name: matched[1].trim(),
      color: typeof label.color === "string" && /^#[0-9a-f]{6}$/i.test(label.color) ? label.color : "#64748b",
    });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Stable grouping key for labels referring to the same client in different Plane projects. */
export function productionClientKey(name: string): string {
  return `cliente:${name.trim().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase("es").replace(/\\s+/g, " ")}`;
}
