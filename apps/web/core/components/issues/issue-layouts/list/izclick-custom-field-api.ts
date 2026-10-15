import { API_BASE_URL } from "@plane/constants";

export type IzclickCustomField = {
  id: string;
  name: string;
  type: "text" | "number" | "date" | "select";
  options: { id: string; name: string; color?: string }[];
  position: number;
};

export const customFieldsEvent = "izclick-custom-fields-updated";
const root = (API_BASE_URL || "").replace(/\/$/, "");
const projectUrl = (slug: string, projectId: string) =>
  `${root}/api/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}`;
const memo = new Map<string, { until: number; fields: IzclickCustomField[] }>();
const pending = new Map<string, Promise<IzclickCustomField[]>>();
const generations = new Map<string, number>();

export function invalidateCustomFields(slug: string, projectId: string) {
  const key = projectUrl(slug, projectId);
  generations.set(key, (generations.get(key) ?? 0) + 1);
  memo.delete(key);
  pending.delete(key);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(customFieldsEvent, { detail: projectId }));
}
export async function getCustomFields(slug: string, projectId: string): Promise<IzclickCustomField[]> {
  const key = projectUrl(slug, projectId);
  const cached = memo.get(key);
  if (cached && cached.until > Date.now()) return cached.fields;
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const generation = generations.get(key) ?? 0;
  const request = (async () => {
    const response = await fetch(`${key}/izclick-custom-fields/`, { credentials: "include" });
    if (!response.ok) throw new Error(`Custom fields API HTTP ${response.status}`);
    const value = await response.json();
    if (!Array.isArray(value)) throw new Error("Respuesta de campos inválida");
    const fields = value.filter((item): item is IzclickCustomField => Boolean(item && typeof item.id === "string" && typeof item.name === "string" && ["text", "number", "date", "select"].includes(item.type)));
    if ((generations.get(key) ?? 0) === generation) memo.set(key, { until: Date.now() + 15000, fields });
    return fields;
  })().finally(() => { if (pending.get(key) === request) pending.delete(key); });
  pending.set(key, request);
  return request;
}

export async function getCustomValues(slug: string, projectId: string, issueId: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${projectUrl(slug, projectId)}/issues/${encodeURIComponent(issueId)}/izclick-custom-field-values/`, { credentials: "include" });
  if (!response.ok) throw new Error(`Custom values HTTP ${response.status}`);
  return response.json();
}
export async function updateCustomValue(slug: string, projectId: string, issueId: string, fieldId: string, value: unknown) {
  const response = await fetch(`${projectUrl(slug, projectId)}/issues/${encodeURIComponent(issueId)}/izclick-custom-field-values/`, {
    method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: { [fieldId]: value } }),
  });
  if (!response.ok) throw new Error(`Custom value update HTTP ${response.status}`);
}
