import { useEffect, useMemo, useState } from "react";
import { calculateProductionMetrics } from "@/app/lib/izclick/production-metrics";
import type { ProductionFilter, ProductionState, ProductionWorkItem } from "@/app/lib/izclick/production-metrics";
import { ProductionStatusPie } from "./production-status-pie";

export type ProductionProducer = {
  id: string;
  name: string;
};

type Props = {
  /** Already permission-filtered workload from Plane. Fetching should use existing authenticated stores/services. */
  issues: readonly ProductionWorkItem[];
  states: readonly ProductionState[];
  producers: readonly ProductionProducer[];
  clients?: readonly { id: string; name: string; color?: string }[];
  projects?: readonly { id: string; name: string }[];
  loading?: boolean;
  onFiltersChange?: (filters: ProductionFilter) => void;
};

/** Production-specific dashboard, independent of Plane's business-model/authorization layer. */
export function ProductionDashboard({
  issues,
  states,
  producers,
  clients = [],
  projects = [],
  loading = false,
  onFiltersChange,
}: Props) {
  const [producerId, setProducerId] = useState("");
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  useEffect(() => {
    onFiltersChange?.({
      producerId: producerId || null,
      clientId: clientId || null,
      projectId: projectId || null,
    });
  }, [producerId, clientId, projectId, onFiltersChange]);

  const metrics = useMemo(
    () =>
      calculateProductionMetrics(issues, states, {
        producerId: producerId || null,
        clientId: clientId || null,
        projectId: projectId || null,
      }),
    [issues, states, producerId, clientId, projectId]
  );

  const producerSummary = useMemo(() => producers.map((producer) => ({
    ...producer,
    metrics: calculateProductionMetrics(issues, states, {
      producerId: producer.id,
      clientId: clientId || null,
      projectId: projectId || null,
    }),
  })).filter((row) => row.metrics.total > 0).sort((a, b) => b.metrics.total - a.metrics.total),
    [issues, states, producers, clientId, projectId]);

  // Aggregate by the actual state catalogue. Unknown or customized states remain
  // in the pie chart and are not falsely classified as approved or rejected.
  const outcomeTotals = useMemo(() => {
    const approved = metrics.slices.filter((slice) => /^aprobado(?:\s+por\s+cliente)?$/i.test(slice.name.trim()))
      .reduce((total, slice) => total + slice.count, 0);
    const rejected = metrics.slices.filter((slice) => /^rechazad[oa](?:\s+por\s+cliente)?$/i.test(slice.name.trim()))
      .reduce((total, slice) => total + slice.count, 0);
    const followUp = metrics.slices.filter((slice) => /^en\s+seguimiento$/i.test(slice.name.trim()))
      .reduce((total, slice) => total + slice.count, 0);
    return { approved, rejected, followUp };
  }, [metrics]);

  // A load without assignees belongs to no producer; surface it explicitly.
  const unassigned = useMemo(() => {
    const ids = new Set<string>();
    for (const issue of issues) {
      if (!issue.id || issue.parent_id || issue.assignee_ids?.length || ids.has(issue.id)) continue;
      if (projectId && issue.project_id !== projectId) continue;
      if (clientId && issue.client_id !== clientId && !issue.label_ids?.includes(clientId)) continue;
      ids.add(issue.id);
    }
    return ids.size;
  }, [issues, projectId, clientId]);

  const selectClass = "w-full rounded-md border border-subtle bg-surface-1 px-3 py-2 text-sm";

  return (
    <div className="flex flex-col gap-5 p-5">
      <header>
        <h1 className="text-xl font-semibold">Control de cargas de Producción</h1>
        <p className="mt-1 text-sm text-custom-text-300">
          Distribución de las cargas por estado y responsable; las subtareas no se contabilizan como cargas.
        </p>
      </header>
      <div className="grid gap-3 md:grid-cols-3" role="group" aria-label="Filtros de producción">
        <label className="flex flex-col gap-1 text-sm">
          Productor
          <select aria-label="Filtrar productor" className={selectClass} value={producerId} onChange={(e) => setProducerId(e.target.value)}>
            <option value="">Todos los productores</option>
            {producers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Cliente
          <select aria-label="Filtrar cliente" className={selectClass} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Todos los clientes</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Proyecto
          <select aria-label="Filtrar proyecto" className={selectClass} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Todos los proyectos</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
      </div>
      {clientId && (
        <p className="flex items-center gap-2 text-sm" aria-live="polite">
          <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ backgroundColor: clients.find((client) => client.id === clientId)?.color || "#64748b" }} />
          Cliente: <strong>{clients.find((client) => client.id === clientId)?.name || "No identificado"}</strong>
        </p>
      )}
      {loading ? (
        <p role="status">Cargando cargas...</p>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Indicadores de cargas">
            {[
              { label: "Total de cargas", value: metrics.total },
              { label: "Aprobadas", value: outcomeTotals.approved },
              { label: "Rechazadas", value: outcomeTotals.rejected },
              { label: "En seguimiento", value: outcomeTotals.followUp },
              { label: "Sin responsable", value: producerId ? 0 : unassigned },
            ].map((indicator) => (
              <div key={indicator.label} className="rounded-lg border border-subtle bg-surface-1 p-4">
                <p className="text-xs text-custom-text-300">{indicator.label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{indicator.value}</p>
              </div>
            ))}
          </section>
          <ProductionStatusPie metrics={metrics} title="Estados de las cargas" />
          {!producerId && producerSummary.length > 0 && (
            <section className="rounded-lg border border-subtle bg-surface-1 p-5" aria-label="Resumen por productor">
              <h2 className="mb-3 text-base font-semibold">Cargas por productor</h2>
              <p className="mb-3 text-xs text-custom-text-300">Una carga con varios responsables aparece en el total de cada uno. El total general cuenta cada carga una sola vez.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b border-subtle"><th className="py-2">Productor</th><th className="py-2 text-right">Cargas</th><th className="py-2">Por estado (cantidad y %)</th></tr></thead>
                  <tbody>{producerSummary.map((row) => (
                    <tr key={row.id} className="border-b border-subtle">
                      <td className="py-2 pr-3">{row.name}</td>
                      <td className="py-2 pr-3 text-right font-medium">{row.metrics.total}</td>
                      <td className="py-2">{row.metrics.slices.map((slice) => `${slice.name}: ${slice.count} (${slice.percent}%)`).join(" · ")}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
