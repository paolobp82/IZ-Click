import { useMemo, useState } from "react";
import { ProductionDashboard } from "@/app/components/izclick/production-dashboard";
import { ProductionLoadDirectory } from "@/app/components/izclick/production-load-directory";
import { ProductionCalendar } from "@/app/components/izclick/production-calendar";
import { usePlaneWorkspaceProduction } from "@/app/lib/izclick/use-plane-workspace-production";
import { matchesProductionFilter } from "@/app/lib/izclick/production-metrics";
import type { ProductionFilter } from "@/app/lib/izclick/production-metrics";

type Props = { workspaceSlug: string };

export function ProductionWorkspacePanel({ workspaceSlug }: Props) {
  const { issues, states, members, clients, projects, loading, error } = usePlaneWorkspaceProduction(workspaceSlug);
  const [filters, setFilters] = useState<ProductionFilter>({});
  const filteredIssues = useMemo(() => issues.filter((issue) => matchesProductionFilter(issue, filters)), [issues, filters]);
  const producers = useMemo(() => {
    const known = new Map(members.map((member) => [member.id, member.name]));
    const ids = new Set(issues.flatMap((issue) => [...(issue.assignee_ids ?? [])]));
    return [...ids].map((id) => ({ id, name: known.get(id) || `Usuario ${id.slice(0, 8)}` }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [members, issues]);
  if (error) return <p role="alert" className="m-5 rounded-md border border-red-400 p-4">{error}</p>;
  return (
    <>
      <ProductionDashboard issues={issues} states={states} producers={producers} clients={clients} projects={projects} loading={loading} onFiltersChange={setFilters} />
      {!loading && <div className="flex flex-col gap-5 px-5 pb-6">
        <ProductionCalendar issues={filteredIssues} projects={projects} clients={clients} workspaceSlug={workspaceSlug} />
        <ProductionLoadDirectory members={members} issues={filteredIssues} states={states} projects={projects} clients={clients} workspaceSlug={workspaceSlug} />
      </div>}
    </>
  );
}
