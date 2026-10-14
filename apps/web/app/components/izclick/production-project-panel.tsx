import { useMemo, useState } from "react";
import { ProductionDashboard } from "@/app/components/izclick/production-dashboard";
import { ProductionCalendar } from "@/app/components/izclick/production-calendar";
import { ProductionLoadDirectory } from "@/app/components/izclick/production-load-directory";
import { ProductionStatesSetup } from "@/app/components/izclick/production-states-setup";
import { usePlaneProjectProduction } from "@/app/lib/izclick/use-plane-project-production";

type Props = { workspaceSlug: string; projectId: string; projectName?: string };
type Tab = "cargas" | "calendario" | "indicadores" | "estados";
const TABS: readonly { id: Tab; label: string }[] = [
  { id: "cargas", label: "Cargas" },
  { id: "calendario", label: "Calendario" },
  { id: "indicadores", label: "Indicadores" },
  { id: "estados", label: "Estados" },
];

export function ProductionProjectPanel({ workspaceSlug, projectId, projectName }: Props) {
  const [tab, setTab] = useState<Tab>("cargas");
  const { issues, states, members, clients, loading, error } = usePlaneProjectProduction(workspaceSlug, projectId);
  const projects = useMemo(() => [{ id: projectId, name: projectName || "Proyecto actual" }], [projectId, projectName]);
  const producers = useMemo(() => {
    const ids = new Set(issues.flatMap((issue) => [...(issue.assignee_ids ?? [])]));
    const known = new Map(members.map((member) => [member.id, member.name]));
    return [...ids].sort().map((id) => ({ id, name: known.get(id) || `Usuario ${id.slice(0, 8)}` }));
  }, [issues, members]);

  if (error) {
    return <div className="m-5 rounded-md border border-red-400 p-4" role="alert">
      No se pudo consultar Producción: {error}
    </div>;
  }

  return (
    <section className="flex h-full w-full flex-col" aria-label="Gestión de cargas IZ-Click">
      <div className="flex flex-wrap gap-2 border-b border-subtle px-5 py-3" role="group" aria-label="Vistas de producción">
        {TABS.map(({ id, label }) => (
          <button type="button" key={id} aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-md border px-3 py-2 text-sm ${tab === id ? "border-custom-primary-100 font-semibold text-custom-primary-100" : "border-subtle"}`}>
            {label}
          </button>
        ))}
      </div>
      {loading && <p className="p-5 text-sm" role="status">Cargando cargas de Producción…</p>}
      {!loading && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "cargas" && <div className="px-5 py-4">
            <ProductionLoadDirectory issues={issues} states={states} projects={projects} clients={clients} workspaceSlug={workspaceSlug} />
          </div>}
          {tab === "calendario" && <div className="px-5 py-4">
            <ProductionCalendar issues={issues} projects={projects} clients={clients} workspaceSlug={workspaceSlug} />
          </div>}
          {tab === "indicadores" && <ProductionDashboard
            issues={issues} states={states} producers={producers} clients={clients} projects={projects} />}
          {tab === "estados" && <div className="px-5 py-4">
            <ProductionStatesSetup workspaceSlug={workspaceSlug} projectId={projectId} />
          </div>}
        </div>
      )}
    </section>
  );
}
