import { API_BASE_URL } from "@plane/constants";
import { useEffect, useState } from "react";
import type { ProductionState, ProductionWorkItem } from "@/app/lib/izclick/production-metrics";
import type { ProductionMember } from "@/app/lib/izclick/production-members";
import { normalizeProductionMembers } from "@/app/lib/izclick/production-members";
import { normalizePlaneCollection, normalizePlaneIssue, normalizePlaneState } from "@/app/lib/izclick/plane-production-adapter";
import { collectPlanePages } from "@/app/lib/izclick/production-pagination";
import { mapWithConcurrency } from "@/app/lib/izclick/production-concurrency";
import { clientsFromPlaneLabels, productionClientKey } from "@/app/lib/izclick/production-clients";
import { eventDateFromLabels } from "@/app/lib/izclick/production-event-date";
import { normalizeEventDateMap } from "@/app/lib/izclick/production-event-date-map";
import { normalizeSigLinkMap } from "@/app/lib/izclick/production-sig-map";
import type { PlaneLabelSummary } from "@/app/lib/izclick/production-event-date";
import type { ProductionClient } from "@/app/lib/izclick/production-clients";

type Project = { id: string; name: string };
type Result = { issues: ProductionWorkItem[]; states: ProductionState[]; members: ProductionMember[]; clients: ProductionClient[]; projects: Project[]; loading: boolean; error: string | null };
const empty = (): Result => ({ issues: [], states: [], members: [], clients: [], projects: [], loading: true, error: null });

async function json(url: string, signal: AbortSignal): Promise<unknown> {
  const base = (API_BASE_URL || "").replace(/\/$/, "");
  const response = await fetch(`${base}${url}`, { credentials: "include", signal });
  if (!response.ok) throw new Error(`Plane HTTP ${response.status} al consultar ${new URL(url, window.location.origin).pathname}`);
  return response.json();
}

/** Only list projects returned by Plane for the current authenticated session. */
function projectList(payload: unknown): Project[] {
  return normalizePlaneCollection(payload, (item) => {
    if (typeof item.id !== "string" || typeof item.name !== "string") return null;
    // Workspace project listings can also include public projects not joined by this user.
    // Only read projects with an active member role; Plane enforces final API authorization.
    if (item.member_role === null || item.member_role === undefined) return null;
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
      const projectData = await mapWithConcurrency(list, 4, async (project) => {
        const base = `${ws}/projects/${encodeURIComponent(project.id)}`;
        const [rawList, rawStates, eventDates, sigLinks, allLabelsResponse] = await Promise.all([
          collectPlanePages(
            (cursor) => {
              const params = new URLSearchParams({ per_page: "100", sub_issue: "true" });
              if (cursor) params.set("cursor", cursor);
              return json(`${base}/issues/?${params}`, controller.signal);
            },
            (payload) => normalizePlaneCollection(payload, normalizePlaneIssue)
          ),
          json(`${base}/states/`, controller.signal),
          json(`${base}/production-event-dates/`, controller.signal).then(normalizeEventDateMap),
          json(`${base}/production-sig-links/`, controller.signal).then(normalizeSigLinkMap),
          json(`${base}/issue-labels/`, controller.signal),
        ]);
        const allLabels = normalizePlaneCollection(allLabelsResponse, (item): PlaneLabelSummary | null =>
          typeof item.id === "string" && typeof item.name === "string"
            ? { id: item.id, name: item.name } : null
        );
        return {
          project, rawList, eventDates, sigLinks, allLabels,
          projectStates: normalizePlaneCollection(rawStates, normalizePlaneState),
        };
      });
      for (const { project, rawList, eventDates, sigLinks, allLabels, projectStates } of projectData) {
        states.push(...projectStates);
        const labels = clientsFromPlaneLabels(allLabels);
        const clientByLabel = new Map<string, string>();
        for (const client of labels) {
          const key = productionClientKey(client.name);
          clientByLabel.set(client.id, key);
          if (!clientsById.has(key)) clientsById.set(key, { ...client, id: key });
        }
        issues.push(...rawList.map((issue) => ({
          ...issue,
          project_id: project.id,
          event_date: eventDates[issue.id] ?? eventDateFromLabels(allLabels, issue.label_ids ?? []),
          sig_code: sigLinks[issue.id]?.code ?? null,
          sig_url: sigLinks[issue.id]?.url ?? null,
          client_id: issue.label_ids?.map((id) => clientByLabel.get(id)).find((id): id is string => Boolean(id)) ?? issue.client_id,
        })));
      }
      if (!controller.signal.aborted) setData({ issues, states, members, clients: [...clientsById.values()].sort((a,b) => a.name.localeCompare(b.name, "es")), projects: list, loading: false, error: null });
    })().catch((err: unknown) => {
      if (!controller.signal.aborted) setData({ ...empty(), loading: false, error: err instanceof Error ? err.message : "Error consultando Plane" });
    });
    return () => controller.abort();
  }, [workspaceSlug]);

  return data;
}
