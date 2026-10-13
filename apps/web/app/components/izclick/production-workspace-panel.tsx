import { useMemo } from "react";
import { ProductionDashboard } from "@/app/components/izclick/production-dashboard";
import { usePlaneWorkspaceProduction } from "@/app/lib/izclick/use-plane-workspace-production";

type Props = { workspaceSlug: string };

export function ProductionWorkspacePanel({ workspaceSlug }: Props) {
  const { issues, states, members, clients, projects, loading, error } = usePlaneWorkspaceProduction(workspaceSlug);
  const producers = useMemo(() => {
    const known = new Map(members.map((member) => [member.id, member.name]));
    const ids = new Set(issues.flatMap((issue) => [...(issue.assignee_ids ?? [])]));
    return [...ids].map((id) => ({ id, name: known.get(id) || `Usuario ${id.slice(0, 8)}` }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [members, issues]);
  if (error) return <p role="alert" className="m-5 rounded-md border border-red-400 p-4">{error}</p>;
  return <ProductionDashboard issues={issues} states={states} producers={producers} clients={clients} projects={projects} loading={loading} />;
}
