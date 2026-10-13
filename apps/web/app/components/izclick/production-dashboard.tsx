import { useMemo, useState } from "react";
import { calculateProductionMetrics } from "@/lib/izclick/production-metrics";
import type { ProductionState, ProductionWorkItem } from "@/lib/izclick/production-metrics";
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
};

/** Production-specific dashboard, independent of Plane's business-model/authorization layer. */
export function ProductionDashboard({
  issues,
  states,
  producers,
  clients = [],
  projects = [],
  loading = false,
}: Props) {
  const [producerId, setProducerId] = useState("");
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const metrics = useMemo(
    () =>
      calculateProductionMetrics(issues, states, {
        producerId: producerId || null,
        clientId: clientId || null,
        projectId: projectId || null,
      }),
    [issues, states, producerId, clientId, projectId]
  );

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
        <ProductionStatusPie metrics={metrics} title="Estados de las cargas" />
      )}
    </div>
  );
}
