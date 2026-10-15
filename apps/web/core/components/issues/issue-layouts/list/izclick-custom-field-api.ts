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

// Queue reads from rows mounted in the same render and request them per project.
// This avoids one API call for each visible work item in large lists.
type ValueRead = {
  issueId: string;
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
};
const valueQueues = new Map<string, ValueRead[]>();

async function flushValueReads(key: string) {
  const queue = valueQueues.get(key) ?? [];
  valueQueues.delete(key);
  if (!queue.length) return;
  const ids = [...new Set(queue.map((item) => item.issueId))];
  const readBatch = async (issueIds: string[]) => {
    const response = await fetch(`${key}/izclick-custom-field-values/batch/`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issue_ids: issueIds }),
    });
    if (!response.ok) throw new Error(`Custom values batch HTTP ${response.status}`);
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Respuesta de valores inválida");
    return result as Record<string, Record<string, unknown>>;
  };
  try {
    const batches: Record<string, Record<string, unknown>> = {};
    for (let offset = 0; offset < ids.length; offset += 200) {
      Object.assign(batches, await readBatch(ids.slice(offset, offset + 200)));
    }
    queue.forEach(({ issueId, resolve }) => resolve(batches[issueId] ?? {}));
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error("No se pudieron consultar los valores");
    queue.forEach(({ reject }) => reject(error));
  }
}

export function getCustomValues(slug: string, projectId: string, issueId: string): Promise<Record<string, unknown>> {
  const key = projectUrl(slug, projectId);
  return new Promise((resolve, reject) => {
    const pending = valueQueues.get(key);
    if (pending) {
      pending.push({ issueId, resolve, reject });
    } else {
      valueQueues.set(key, [{ issueId, resolve, reject }]);
      void Promise.resolve().then(() => flushValueReads(key));
    }
  });
}

export async function updateCustomValue(slug: string, projectId: string, issueId: string, fieldId: string, value: unknown) {
  const response = await fetch(`${projectUrl(slug, projectId)}/issues/${encodeURIComponent(issueId)}/izclick-custom-field-values/`, {
    method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: { [fieldId]: value } }),
  });
  if (!response.ok) throw new Error(`Custom value update HTTP ${response.status}`);
}
