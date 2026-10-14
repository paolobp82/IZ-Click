import { API_BASE_URL } from "@plane/constants";
import { useEffect, useState } from "react";
import type { ProductionState, ProductionWorkItem } from "@/app/lib/izclick/production-metrics";
import { normalizeProductionMembers } from "@/app/lib/izclick/production-members";
import type { ProductionMember } from "@/app/lib/izclick/production-members";
import { clientsFromPlaneLabels } from "@/app/lib/izclick/production-clients";
import { eventDateFromLabels } from "@/app/lib/izclick/production-event-date";
import { normalizeEventDateMap } from "@/app/lib/izclick/production-event-date-map";
import { normalizeSigLinkMap } from "@/app/lib/izclick/production-sig-map";
import type { PlaneLabelSummary } from "@/app/lib/izclick/production-event-date";
import type { ProductionClient } from "@/app/lib/izclick/production-clients";
import { normalizePlaneCollection, normalizePlaneIssue, normalizePlaneState } from "@/app/lib/izclick/plane-production-adapter";
import { collectPlanePages } from "@/app/lib/izclick/production-pagination";

type Result = {
  issues: ProductionWorkItem[];
  states: ProductionState[];
  members: ProductionMember[];
  clients: ProductionClient[];
  loading: boolean;
  error: string | null;
};

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const base = (API_BASE_URL || "").replace(/\/$/, "");
  const response = await fetch(url.startsWith("http") ? url : `${base}${url}`, { credentials: "include", signal });
  if (!response.ok) throw new Error(`Error consultando Plane (HTTP ${response.status})`);
  return response.json();
}

async function fetchAllProjectIssues(base: string, projectId: string, signal: AbortSignal): Promise<ProductionWorkItem[]> {
  const issues = await collectPlanePages(
    (cursor) => {
      const params = new URLSearchParams({ per_page: "100", sub_issue: "true" });
      if (cursor) params.set("cursor", cursor);
      return fetchJson(`${base}/issues/?${params.toString()}`, signal);
    },
    (payload) => normalizePlaneCollection(payload, normalizePlaneIssue)
  );
  return issues.map((issue) => ({
    ...issue,
    project_id: issue.project_id || projectId,
  }));
}

/**
 * Uses the logged-in Plane session, project-scoped API and AbortController.
 * No tokens are embedded and project visibility is enforced by Plane's API.
 */
export function usePlaneProjectProduction(workspaceSlug: string, projectId: string): Result {
  const [result, setResult] = useState<Result>({
    issues: [], states: [], members: [], clients: [], loading: true, error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    const base = `/api/workspaces/${encodeURIComponent(workspaceSlug)}/projects/${encodeURIComponent(projectId)}`;
    setResult({ issues: [], states: [], members: [], clients: [], loading: true, error: null });

    Promise.all([
      fetchAllProjectIssues(base, projectId, controller.signal),
      fetchJson(`${base}/states/`, controller.signal).then((value) =>
        normalizePlaneCollection(value, normalizePlaneState)
      ),
      fetchJson(`/api/workspaces/${encodeURIComponent(workspaceSlug)}/members/`, controller.signal)
        .then(normalizeProductionMembers)
        .catch(() => [] as ProductionMember[]),
      fetchJson(`${base}/production-event-dates/`, controller.signal)
        .then(normalizeEventDateMap),
      fetchJson(`${base}/production-sig-links/`, controller.signal)
        .then(normalizeSigLinkMap),
      fetchJson(`${base}/issue-labels/`, controller.signal)
        .then((payload) => normalizePlaneCollection(payload, (item): PlaneLabelSummary | null =>
          typeof item.id === "string" && typeof item.name === "string" ? { id: item.id, name: item.name } : null
        )),
    ])
      .then(([issues, states, members, eventDates, sigLinks, allLabels]) => {
        const clients = clientsFromPlaneLabels(allLabels);
        const clientLabels = new Set(clients.map((client) => client.id));
        const normalizedIssues = issues.map((issue) => ({
          ...issue,
          event_date: eventDates[issue.id] ?? eventDateFromLabels(allLabels, issue.label_ids ?? []),
          sig_code: sigLinks[issue.id]?.code ?? null,
          sig_url: sigLinks[issue.id]?.url ?? null,
          client_id: issue.label_ids?.find((id) => clientLabels.has(id)) ?? issue.client_id,
        }));
        if (!controller.signal.aborted) setResult({ issues: normalizedIssues, states, members, clients, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({
            issues: [], states: [], members: [], clients: [], loading: false,
            error: error instanceof Error ? error.message : "No se pudieron obtener las cargas",
          });
        }
      });

    return () => controller.abort();
  }, [workspaceSlug, projectId]);

  return result;
}
