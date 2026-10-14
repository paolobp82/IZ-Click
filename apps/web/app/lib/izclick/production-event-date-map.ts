import { validCalendarDate } from "./production-schedule.ts";

export function normalizeEventDateMap(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("El endpoint de fechas devolvió una respuesta inesperada");
  }
  const result: Record<string, string> = {};
  for (const [issueId, value] of Object.entries(payload)) {
    if (!/^[0-9a-f-]{36}$/i.test(issueId) || typeof value !== "string" || !validCalendarDate(value)) {
      throw new Error("La respuesta de fechas contiene datos incorrectos");
    }
    result[issueId] = value;
  }
  return result;
}
