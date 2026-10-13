import { useEffect, useState } from "react";
import type { ProductionState, ProductionWorkItem } from "@/lib/izclick/production-metrics";
import { normalizeProductionMembers } from "@/lib/izclick/production-members";
import type { ProductionMember } from "@/lib/izclick/production-members";
import { normalizePlaneCollection, normalizePlaneIssue, normalizePlaneState } from "@/lib/izclick/plane-production-adapter";

type Result = {
  issues: ProductionWorkItem[];
  states: ProductionState[];
  members: ProductionMember[];
  loading: boolean;
  error: string | null;
};

type PlanePage = {
  results?: unknown[];
  next_cursor?: string | null;
  next_page_results?: boolean;
  next?: string | null;
};

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { credentials: "same-origin", signal });
  if (!response.ok) throw new Error(`Error consultando Plane (HTTP ${response.status})`);
  return response.json();
}

async function fetchAllProjectIssues(base: string, signal: AbortSignal): Promise<ProductionWorkItem[]> {
  const issues: ProductionWorkItem[] = [];
  const visited = new Set<string>();
  let cursor: string | null = null;

  // Strict cap: fail visibly instead of silently showing incomplete totals.
  for (let page = 0; page < 200; page++) {
    const url = new URL(`${base}/issues/`, window.location.origin);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("sub_issue", "true");
    if (cursor) url.searchParams.set("cursor", cursor);
    const payload = await fetchJson(url.toString(), signal);
    issues.push(...normalizePlaneCollection(payload, normalizePlaneIssue));
    if (Array.isArray(payload)) return issues;

    const data = payload as PlanePage;
    const hasNext = data.next_page_results === true || Boolean(data.next_cursor) || Boolean(data.next);
    if (!hasNext) {
      // A full page without pagination metadata could be incomplete.
      if (data.next_page_results !== false && Array.isArray(data.results) && data.results.length === 100 && !data.next_cursor && !data.next) {
        throw new Error("La API no informó la paginación; no es seguro calcular los totales.");
      }
      return issues;
    }
    if (!data.next_cursor || visited.has(data.next_cursor)) {
      throw new Error("Paginación de Plane incompleta; no se mostrarán totales parciales.");
    }
    visited.add(data.next_cursor);
    cursor = data.next_cursor;
  }
  throw new Error("Demasiadas páginas de cargas; se canceló el cálculo para proteger la precisión.");
}

/**
 * Uses the logged-in Plane session, project-scoped API and AbortController.
 * No tokens are embedded and project visibility is enforced by Plane's API.
 */
export function usePlaneProjectProduction(workspaceSlug: string, projectId: string): Result {
  const [result, setResult] = useState<Result>({
    issues: [], states: [], members: [], loading: true, error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    const base = `/api/workspaces/${encodeURIComponent(workspaceSlug)}/projects/${encodeURIComponent(projectId)}`;
    setResult({ issues: [], states: [], members: [], loading: true, error: null });

    Promise.all([
      fetchAllProjectIssues(base, controller.signal),
      fetchJson(`${base}/states/`, controller.signal).then((value) =>
        normalizePlaneCollection(value, normalizePlaneState)
      ),
      fetchJson(`/api/workspaces/${encodeURIComponent(workspaceSlug)}/members/`, controller.signal)
        .then(normalizeProductionMembers)
        .catch(() => [] as ProductionMember[]),
    ])
      .then(([issues, states, members]) => {
        if (!controller.signal.aborted) setResult({ issues, states, members, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({
            issues: [], states: [], members: [], loading: false,
            error: error instanceof Error ? error.message : "No se pudieron obtener las cargas",
          });
        }
      });

    return () => controller.abort();
  }, [workspaceSlug, projectId]);

  return result;
}
