import { useEffect, useState } from "react";
import type { ProductionState, ProductionWorkItem } from "@/app/lib/izclick/production-metrics";
import type { ProductionMember } from "@/app/lib/izclick/production-members";
import { normalizeProductionMembers } from "@/app/lib/izclick/production-members";
import { normalizePlaneCollection, normalizePlaneIssue, normalizePlaneState } from "@/app/lib/izclick/plane-production-adapter";

type Project = { id: string; name: string };
type Result = { issues: ProductionWorkItem[]; states: ProductionState[]; members: ProductionMember[]; projects: Project[]; loading: boolean; error: string | null };
const empty = (): Result => ({ issues: [], states: [], members: [], projects: [], loading: true, error: null });

async function json(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { credentials: "same-origin", signal });
  if (!response.ok) throw new Error(`Plane HTTP ${response.status} al consultar ${new URL(url, window.location.origin).pathname}`);
  return response.json();
}

/** Only list projects returned by Plane for the current authenticated session. */
function projectList(payload: unknown): Project[] {
  return normalizePlaneCollection(payload, (item) => {
    if (typeof item.id !== "string" || typeof item.name !== "string") return null;
    return { id: item.id, name: item.name };
  });
}

export function usePlaneWorkspaceProduction(workspaceSlug: string): Result {
  const [data, setData] = useState<Result>(empty);

  useEffect(() => {
    const controller = new AbortController();
    setData(empty());
    const ws = `/api/workspaces/${encodeURIComponent(workspaceSlug)}`;

    (async () => {
      const projects = projectList(await json(`${ws}/projects/`, controller.signal));
      // Do not silently truncate totals: the first version only accepts non-paginated project lists.
      const response = await json(`${ws}/projects/?per_page=100`, controller.signal);
      const list = projectList(response);
      if (list.length >= 100 || (response && typeof response === "object" && !Array.isArray(response) &&
        ("next_cursor" in response || "next_page_results" in response) && (
          (response as { next_cursor?: unknown }).next_cursor ||
          (response as { next_page_results?: unknown }).next_page_results === true
        ))) throw new Error("La lista de proyectos requiere paginación: no se muestran cifras parciales.");
      // Prefer a single verified project listing, rather than mixing two snapshots.
      void projects;
      const members = await json(`${ws}/members/`, controller.signal).then(normalizeProductionMembers).catch(() => [] as ProductionMember[]);
      const issues: ProductionWorkItem[] = [];
      const states: ProductionState[] = [];
      for (const project of list) {
        const base = `${ws}/projects/${encodeURIComponent(project.id)}`;
        const [rawIssues, rawStates] = await Promise.all([
          json(`${base}/issues/?per_page=100&sub_issue=true`, controller.signal),
          json(`${base}/states/`, controller.signal),
        ]);
        const rawList = normalizePlaneCollection(rawIssues, normalizePlaneIssue);
        if (rawList.length >= 100 || (rawIssues && typeof rawIssues === "object" && !Array.isArray(rawIssues) && (
          (rawIssues as { next_cursor?: unknown }).next_cursor ||
          (rawIssues as { next_page_results?: unknown }).next_page_results === true
        ))) throw new Error(`El proyecto ${project.name} requiere paginación; no se muestran cifras parciales.`);
        issues.push(...rawList.map((issue) => ({ ...issue, project_id: project.id })));
        states.push(...normalizePlaneCollection(rawStates, normalizePlaneState));
      }
      if (!controller.signal.aborted) setData({ issues, states, members, projects: list, loading: false, error: null });
    })().catch((err: unknown) => {
      if (!controller.signal.aborted) setData({ ...empty(), loading: false, error: err instanceof Error ? err.message : "Error consultando Plane" });
    });
    return () => controller.abort();
  }, [workspaceSlug]);

  return data;
}
