/**
 * Exhaustive traversal of Plane cursor pages. Throws on ambiguous pagination to
 * avoid reporting incomplete workload totals as though they were complete.
 */
export async function collectPlanePages<T>(
  load: (cursor: string | null) => Promise<unknown>,
  normalize: (response: unknown) => T[],
  maxPages = 200
): Promise<T[]> {
  const out: T[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const response = await load(cursor);
    const rows = normalize(response);
    out.push(...rows);
    if (Array.isArray(response)) return out;
    if (!response || typeof response !== "object" || !("results" in response)) {
      throw new Error("Plano de paginación no reconocido: resultados incompletos");
    }
    const payload = response as { next_cursor?: unknown; next_page_results?: unknown; next?: unknown };
    const next = typeof payload.next_cursor === "string" && payload.next_cursor
      ? payload.next_cursor
      : typeof payload.next === "string" && payload.next ? payload.next : null;
    const more = payload.next_page_results === true || Boolean(next);
    if (!more) return out;
    if (!next || cursors.has(next)) throw new Error("Paginación inconsistente de Plane");
    cursors.add(next);
    cursor = next;
  }
  throw new Error("Se alcanzó el límite de paginación de Plane");
}
