import { API_BASE_URL } from "@plane/constants";
import { normalizeEventDateMap } from "@/app/lib/izclick/production-event-date-map";
import { normalizeSigLinkMap } from "@/app/lib/izclick/production-sig-map";
import { clientsFromPlaneLabels } from "@/app/lib/izclick/production-clients";
import type { ProductionClient } from "@/app/lib/izclick/production-clients";

export type ProjectProductionMetadata = {
  dates: Record<string, string>;
  sigLinks: Record<string, { code: string; url: string }>;
  clients: ProductionClient[];
};

const pending = new Map<string, Promise<ProjectProductionMetadata>>();
const cache = new Map<string, { value: ProjectProductionMetadata; expiresAt: number }>();
const CACHE_TTL_MS = 15_000;

/**
 * Share project-scoped API calls across all visible spreadsheet rows.
 * Cache successful results briefly to support virtualized rows and avoid bursts.
 * Invalidate immediately after a successful inline write.
 * Editing a cell uses the native per-issue endpoint and refreshes its saved value.
 */
export function fetchProjectProductionMetadata(workspaceSlug: string, projectId: string): Promise<ProjectProductionMetadata> {
  const key = JSON.stringify([workspaceSlug, projectId]);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
  cache.delete(key);
  const active = pending.get(key);
  if (active) return active;
  const root = (API_BASE_URL || "").replace(/\/$/, "");
  const base = `${root}/api/workspaces/${encodeURIComponent(workspaceSlug)}/projects/${encodeURIComponent(projectId)}`;
  const read = async (endpoint: string): Promise<unknown> => {
    const response = await fetch(`${base}/${endpoint}/`, { credentials: "include" });
    if (!response.ok) throw new Error(`Error HTTP ${response.status} consultando ${endpoint}`);
    return response.json();
  };
  const promise: Promise<ProjectProductionMetadata> = Promise.all([
    read("production-event-dates"),
    read("production-sig-links"),
    read("issue-labels"),
  ]).then(([dates, links, labels]) => ({
    dates: normalizeEventDateMap(dates),
    sigLinks: normalizeSigLinkMap(links),
    clients: clientsFromPlaneLabels(labels),
  })).then((value) => {
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }).finally(() => {
    if (pending.get(key) === promise) pending.delete(key);
  });
  pending.set(key, promise);
  return promise;
}

/** Flush stale snapshots when a user edits native Plane metadata or client labels. */
export function invalidateProjectProductionMetadata(workspaceSlug: string, projectId: string): void {
  cache.delete(JSON.stringify([workspaceSlug, projectId]));
}
