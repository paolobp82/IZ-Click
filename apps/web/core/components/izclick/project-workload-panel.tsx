import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import useSWR from "swr";
import { coordinationService } from "@/services/izclick-coordination.service";
import { projectWorkload } from "./project-workload";

export default function ProjectWorkloadPanel() {
  const { workspaceSlug = "" } = useParams();
  const [params] = useSearchParams();
  const projectId = params.get("workload_project") ?? "";
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const workload = useSWR(workspaceSlug && projectId ? ["izclick-task-workload", workspaceSlug] : null,
    () => coordinationService.taskWorkload(workspaceSlug), { refreshInterval: 15000 });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const rows = projectWorkload(workload.data ?? [], projectId, today);
  const tasks = [...new Map(rows.flatMap(row => row.tasks).map(task => [task.id, task])).values()];
  const title = tasks[0]?.project_name;
  const date = (value: string | null) => value ? value.split("-").reverse().join("/") : "Sin fecha";
  return <main className="h-full overflow-y-auto bg-surface-1 p-6" aria-label="Distribución de cargas">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold">Cargas por productor</h1>
        {title && <p className="mt-1 text-secondary">{title}</p>}</div>
      <div className="flex gap-4 text-sm">
        <Link to={`/${workspaceSlug}/projects/${projectId}/issues/`}>Volver a tareas</Link>
        <button type="button" disabled={workload.isValidating} onClick={() => void workload.mutate()}>Actualizar</button>
      </div>
    </div>
    <p className="mt-3 text-sm text-secondary">Cargas activas de este proyecto, incluidas las asignaciones anteriores.
      No se cuentan subtareas, tareas completadas, canceladas ni archivadas. Actualización automática cada 15 segundos.</p>
    {!projectId ? <p role="alert">Selecciona un proyecto para ver sus cargas.</p>
      : workload.error ? <p role="alert" className="mt-6">No se pudo cargar la distribución. Comprueba tu acceso y pulsa Actualizar.</p>
      : !workload.data ? <p role="status" className="mt-6">Cargando distribución…</p>
      : <>
        <p className="mt-5 font-medium">{tasks.length} cargas activas asignadas · {rows.length} productores</p>
        {rows.length === 0 && <p className="mt-4">No hay productores activos configurados en este espacio.</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen por productor">
          {rows.map(row => <button key={row.producer_id} type="button" aria-pressed={selected === row.producer_id}
            className={`rounded-lg border p-4 text-left ${selected === row.producer_id ? "border-accent-primary" : "border-subtle"}`}
            onClick={() => setSelected(current => current === row.producer_id ? "" : row.producer_id)}>
            <h2 className="font-semibold">{row.producer_name}</h2>
            <p className="mt-2 text-lg">{row.active_count} cargas activas</p>
            <p className="mt-1 text-sm text-secondary">{row.overdue_count} vencidas · {row.due_soon_count} vencen en 7 días</p>
          </button>)}
        </div>
        <div className="mt-6 flex flex-wrap gap-4">
          <label className="text-sm">Productor <select className="ml-2 rounded border border-subtle bg-surface-1 p-2"
            value={selected} onChange={event => setSelected(event.target.value)}>
            <option value="">Todos</option>{rows.map(row => <option key={row.producer_id} value={row.producer_id}>{row.producer_name}</option>)}
          </select></label>
          <label className="text-sm">Buscar carga o cliente <input className="ml-2 rounded border border-subtle bg-surface-1 p-2"
            value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre, código o cliente" /></label>
        </div>
        {rows.filter(row => !selected || row.producer_id === selected).map(row => {
          const visible = row.tasks.filter(task => [task.name, task.identifier, ...task.clients].join(" ")
            .toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es")));
          return <section key={row.producer_id} className="mt-6" aria-label={`Cargas de ${row.producer_name}`}>
            <h2 className="font-semibold">{row.producer_name} · {row.active_count} cargas activas</h2>
            {visible.length === 0 ? <p className="mt-2 text-sm text-secondary">{row.tasks.length ? "Sin coincidencias con la búsqueda." : "Sin cargas activas en este proyecto."}</p>
              : <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
                <thead><tr>{["Carga", "Cliente", "Estado", "Inicio", "Vencimiento"].map(label => <th key={label} className="border-b border-subtle p-3">{label}</th>)}</tr></thead>
                <tbody>{visible.map(task => <tr key={task.id}>
                  <td className="border-b border-subtle p-3"><Link className="text-accent-primary" to={task.url}>{task.identifier} · {task.name}</Link></td>
                  <td className="border-b border-subtle p-3">{task.clients.join(", ") || "Sin cliente"}</td>
                  <td className="border-b border-subtle p-3">{task.state}</td>
                  <td className="border-b border-subtle p-3">{date(task.start_date)}</td>
                  <td className="border-b border-subtle p-3">{date(task.due_date)}{task.due_date && task.due_date < today && " · Vencida"}</td>
                </tr>)}</tbody>
              </table></div>}
          </section>;
        })}
      </>}
  </main>;
}
