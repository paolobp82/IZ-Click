import { SIG_LINK_PREFIX, sigProjectAssociation } from "./production-sig.ts";

export type SigProjectReference = { code: string; url: string };

export function normalizeSigLinkMap(payload: unknown): Record<string, SigProjectReference> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("La API de SIG devolvió un formato desconocido");
  }
  const result: Record<string, SigProjectReference> = {};
  for (const [issueId, value] of Object.entries(payload)) {
    if (!/^[0-9a-f-]{36}$/i.test(issueId)) throw new Error("ID de carga inválido en enlaces SIG");
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const record = value as { code?: unknown; url?: unknown };
    if (typeof record.code !== "string" || typeof record.url !== "string") continue;
    const link = sigProjectAssociation({ id: issueId, title: SIG_LINK_PREFIX + record.code, url: record.url });
    if (link) result[issueId] = { code: link.code, url: link.url };
  }
  return result;
}
