/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */
import { useState } from "react";
import { useParams, useSearchParams } from "react-router";
import useSWR from "swr";
import { coordinationService, type CoordinationTask } from "@/services/izclick-coordination.service";

export default function TaskCoordinationPanel() {
  const { workspaceSlug = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const selected = params.get("task");
  const board = useSWR(
    workspaceSlug ? ["izclick-task-board", workspaceSlug] : null,
    () => coordinationService.tasks(workspaceSlug),
    { refreshInterval: 15000 }
  );
  const workload = useSWR(
    workspaceSlug ? ["izclick-task-workload", workspaceSlug] : null,
    () => coordinationService.taskWorkload(workspaceSlug),
    { refreshInterval: 15000 }
  );
  const members = useSWR(workspaceSlug ? ["izclick-task-members", workspaceSlug] : null, () =>
    coordinationService.roles(workspaceSlug)
  );
  const [tab, setTab] = useState("pending");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const canAssign = board.data?.role === "coordinator" || board.data?.role === "superadmin";
  const producers = members.data?.filter((member) => member.role === "producer") ?? [];
  const name = (id: string | null) => members.data?.find((member) => member.user_id === id)?.name || "Pendiente";
  const tasks = board.data?.tasks ?? [];
  const visible = tasks.filter(
    (task) => task.id === selected || (!task.closed && (tab === "all" || task.status === tab))
  );
  async function assign(task: CoordinationTask) {
    if (!choices[task.id] || busy) return;
    setBusy(task.id);
    setError("");
    try {
      await coordinationService.assignTask(workspaceSlug, task, choices[task.id]);
      setChoices((current) => ({ ...current, [task.id]: "" }));
    } catch {
      setError("No se pudo asignar. La carga pudo cambiar; revisa la cola actualizada antes de volver a intentarlo.");
    } finally {
      await Promise.allSettled([board.mutate(), workload.mutate()]);
      setBusy(null);
    }
  }
  if (board.error)
    return (
      <main className="p-6">
        <p role="alert">No se pudo cargar coordinación. Comprueba tu acceso e inténtalo otra vez.</p>
        <button type="button" onClick={() => void board.mutate()}>
          Reintentar
        </button>
      </main>
    );
  if (!board.data)
    return (
      <main className="p-6" role="status">
        Cargando coordinación…
      </main>
    );
  return (
    <main className="h-full overflow-y-auto bg-surface-1 p-6">
      <h1 className="text-xl font-semibold">Coordinación y cargas</h1>
      <p className="text-sm mt-2 text-secondary">
        Comercial envía la carga desde Nueva tarea. Ambas coordinadoras reciben la misma solicitud y coordinación asigna
        al productor.
      </p>
      {error && (
        <p role="alert" className="text-red-600 my-3">
          {error}
        </p>
      )}
      <section className="mt-6" aria-label="Cola compartida de tareas">
        <h2 className="text-lg font-semibold">Cola compartida</h2>
        <div className="my-3 flex gap-3">
          {[
            ["pending", "Pendientes"],
            ["assigned", "Asignadas"],
            ["all", "Todas"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={tab === value}
              className="rounded border border-subtle px-3 py-2"
              onClick={() => {
                setTab(value);
                setParams({});
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {!visible.length && (
          <p className="text-sm py-5">
            No hay cargas en esta vista. Las nuevas solicitudes comerciales aparecerán aquí al enviarse a coordinación.
          </p>
        )}
        <div className="space-y-3">
          {visible.map((task) => (
            <article key={task.id} className="rounded border border-subtle p-4" aria-label={task.name}>
              <h3 className="font-semibold">
                <a href={task.url}>
                  {task.identifier} · {task.name}
                </a>
              </h3>
              <p className="text-sm mt-1">
                {task.project_name} · {task.clients.join(", ") || "Sin cliente"} · Vence: {task.due_date || "Sin fecha"}
              </p>
              <p className="text-sm mt-1">
                Comercial: {name(task.commercial_id)} · Productor: {name(task.producer_id)} · {task.state}
              </p>
              {canAssign && !task.closed && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <select
                    aria-label={`Productor de ${task.name}`}
                    className="rounded border border-subtle bg-surface-1 p-2"
                    disabled={!!busy}
                    value={choices[task.id] ?? ""}
                    onChange={(event) => setChoices((current) => ({ ...current, [task.id]: event.target.value }))}
                  >
                    <option value="">Seleccionar productor</option>
                    {producers.map((producer) => (
                      <option key={producer.user_id} value={producer.user_id}>
                        {producer.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="rounded bg-accent-primary px-4 py-2 text-white"
                    disabled={!!busy || !choices[task.id] || choices[task.id] === task.producer_id}
                    onClick={() => void assign(task)}
                  >
                    {busy === task.id ? "Asignando…" : task.producer_id ? "Reasignar productor" : "Asignar productor"}
                  </button>
                </div>
              )}
              <a className="text-sm mt-3 inline-block underline" href={task.url}>
                Abrir carga, comentarios y archivos
              </a>
              {task.history.length > 0 && (
                <details className="text-sm mt-3">
                  <summary>Historial de asignaciones</summary>
                  <ol className="mt-2 space-y-1">
                    {task.history.map((entry, index) => (
                      <li key={`${entry.created_at}-${index}`}>
                        {entry.created_at.slice(0, 16).replace("T", " ")} · {name(entry.actor_id)}:{" "}
                        {entry.previous_producer_id ? name(entry.previous_producer_id) : "Sin asignar"} →{" "}
                        {name(entry.new_producer_id)}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </article>
          ))}
        </div>
      </section>
      <section className="mt-8" aria-label="Carga de trabajo por productor">
        <h2 className="text-lg font-semibold">Carga de trabajo por productor</h2>
        <p className="text-sm my-2 text-secondary">
          Incluye las tareas activas ya asignadas en las listas existentes. No se duplican las subtareas ni se
          convierten tareas antiguas en solicitudes pendientes.
        </p>
        {workload.error ? (
          <p role="alert">No se pudieron cargar las cargas de trabajo.</p>
        ) : !workload.data ? (
          <p role="status">Cargando cargas de trabajo…</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {workload.data.map((producer) => (
              <article className="rounded border border-subtle p-4" key={producer.producer_id}>
                <h3 className="font-semibold">{producer.producer_name}</h3>
                <p className="text-sm my-2">
                  {producer.active_count} activas · {producer.overdue_count} vencidas · {producer.due_soon_count}{" "}
                  próximas
                </p>
                <ul className="text-sm space-y-1">
                  {producer.tasks.map((task) => (
                    <li key={task.id}>
                      <a href={task.url}>{task.name}</a> · {task.due_date || "Sin fecha"}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
