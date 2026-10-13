import { useEffect, useState } from "react";
import type { ProductionState, ProductionWorkItem } from "@/app/lib/izclick/production-metrics";
import type { ProductionMember } from "@/app/lib/izclick/production-members";
import { normalizeProductionMembers } from "@/app/lib/izclick/production-members";
import { normalizePlaneCollection, normalizePlaneIssue, normalizePlaneState } from "@/app/lib/izclick/plane-production-adapter";
import { collectPlanePages } from "@/app/lib/izclick/production-pagination";
import { clientsFromPlaneLabels } from "@/app/lib/izclick/production-clients";
import type { ProductionClient } from "@/app/lib/izclick/production-clients";

type Project = { id: string; name: string };
type Result = { issues: ProductionWorkItem[]; states: ProductionState[]; members: ProductionMember[]; clients: ProductionClient[]; projects: Project[]; loading: boolean; error: string | null };
const empty = (): Result => ({ issues: [], states: [], members: [], clients: [], projects: [], loading: true, error: null });

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
      const list = await collectPlanePages(
        (cursor) => {
          const params = new URLSearchParams({ per_page: "100" });
          if (cursor) params.set("cursor", cursor);
          return json(`${ws}/projects/?${params}`, controller.signal);
        },
        projectList
      );
      const members = await json(`${ws}/members/`, controller.signal).then(normalizeProductionMembers).catch(() => [] as ProductionMember[]);
      const issues: ProductionWorkItem[] = [];
      const states: ProductionState[] = [];
      const clientsById = new Map<string, ProductionClient>();
      for (const project of list) {
        const base = `${ws}/projects/${encodeURIComponent(project.id)}`;
        const [rawList, rawStates] = await Promise.all([
          collectPlanePages(
            (cursor) => {
              const params = new URLSearchParams({ per_page: "100", sub_issue: "true" });
              if (cursor) params.set("cursor", cursor);
              return json(`${base}/issues/?${params}`, controller.signal);
            },
            (payload) => normalizePlaneCollection(payload, normalizePlaneIssue)
          ),
          json(`${base}/states/`, controller.signal),
        ]);
        issues.push(...rawList.map((issue) => ({ ...issue, project_id: project.id })));
        states.push(...normalizePlaneCollection(rawStates, normalizePlaneState));
        const labels = await json(`${base}/issue-labels/`, controller.signal)
          .then(clientsFromPlaneLabels)
          .catch(() => [] as ProductionClient[]);
        for (const client of labels) clientsById.set(client.id, client);
      }
      if (!controller.signal.aborted) setData({ issues, states, members, clients: [...clientsById.values()].sort((a,b) => a.name.localeCompare(b.name, "es")), projects: list, loading: false, error: null });
    })().catch((err: unknown) => {
      if (!controller.signal.aborted) setData({ ...empty(), loading: false, error: err instanceof Error ? err.message : "Error consultando Plane" });
    });
    return () => controller.abort();
  }, [workspaceSlug]);

  return data;
}
