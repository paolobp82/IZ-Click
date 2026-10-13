import { useMemo } from "react";
import { ProductionDashboard } from "@/app/components/izclick/production-dashboard";
import { usePlaneProjectProduction } from "@/app/lib/izclick/use-plane-project-production";

type Props = { workspaceSlug: string; projectId: string; projectName?: string };

export function ProductionProjectPanel({ workspaceSlug, projectId, projectName }: Props) {
  const { issues, states, members, clients, loading, error } = usePlaneProjectProduction(workspaceSlug, projectId);
  const producers = useMemo(() => {
    const ids = new Set(issues.flatMap((issue) => [...(issue.assignee_ids ?? [])]));
    const known = new Map(members.map((member) => [member.id, member.name]));
    return [...ids].sort().map((id) => ({ id, name: known.get(id) || `Usuario ${id.slice(0, 8)}` }));
  }, [issues, members]);

  if (error) {
    return (
      <div className="m-5 rounded-md border border-red-400 p-4" role="alert">
        No se pudo calcular el control de cargas: {error}
      </div>
    );
  }

  return (
    <ProductionDashboard
      issues={issues}
      states={states}
      producers={producers}
      clients={clients}
      projects={[{ id: projectId, name: projectName || "Proyecto actual" }]}
      loading={loading}
    />
  );
}
