/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import { useParams, useSearchParams } from "react-router";
import useSWR from "swr";
import { coordinationService as service } from "@/services/izclick-coordination.service";
import type { CoordinationProject, BusinessMember } from "@/services/izclick-coordination.service";

const fieldClass = "rounded border border-subtle bg-surface-1 px-3 py-2 text-primary";
const buttonClass = "rounded bg-accent-primary px-4 py-2 text-white disabled:opacity-50";
const roles = {
  commercial: "Comercial",
  coordinator: "Coordinación",
  producer: "Producción",
  superadmin: "Superadmin",
};

function ProjectEditor({
  project,
  slug,
  members,
  editable,
  assignable,
  refresh,
}: {
  project: CoordinationProject;
  slug: string;
  members: BusinessMember[];
  editable: boolean;
  assignable: boolean;
  refresh: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { data: conversation, mutate } = useSWR(["izclick-conversation", slug, project.project_id], () =>
    service.conversation(slug, project.project_id)
  );
  const name = (id: string | null) => members.find((m) => m.user_id === id)?.name || id || "Sin asignar";
  async function act(callback: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await callback();
      await Promise.all([refresh(), mutate()]);
    } catch {
      setError("No se pudo guardar. Puede haber un cambio de otro usuario. Actualiza y vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded border border-subtle p-5">
      <h2 className="text-xl font-semibold">{project.project_name}</h2>
      <a className="text-accent-primary" href={`/${slug}/projects/${project.project_id}/issues/`}>
        Abrir proyecto
      </a>
      <p>
        Comercial: {name(project.commercial_id)} · Productor: {name(project.producer_id)}
      </p>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {assignable && (
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void act(() => service.assign(slug, project, String(data.get("producer"))));
          }}
        >
          <label>
            Productor{" "}
            <select
              name="producer"
              required
              className={fieldClass}
              defaultValue={project.producer_id || ""}
              disabled={busy}
            >
              <option value="" disabled>
                Seleccionar productor
              </option>
              {members
                .filter((m) => m.role === "producer")
                .map((m) => (
                  <option value={m.user_id} key={m.user_id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>
          <button className={buttonClass} disabled={busy}>
            {project.producer_id ? "Reasignar" : "Asignar"}
          </button>
        </form>
      )}
      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void act(() =>
            service.update(slug, project, {
              client: String(data.get("client")),
              start_date: String(data.get("start_date")) || null,
              due_date: String(data.get("due_date")) || null,
              workflow_status: data.get("workflow_status") as CoordinationProject["workflow_status"],
              quotation_url: String(data.get("quotation_url")),
            })
          );
        }}
      >
        <label>
          Cliente{" "}
          <input
            name="client"
            maxLength={255}
            className={fieldClass}
            defaultValue={project.client}
            disabled={!editable || busy}
          />
        </label>
        <label>
          Estado{" "}
          <select
            name="workflow_status"
            className={fieldClass}
            defaultValue={project.workflow_status}
            disabled={!editable || busy}
          >
            <option value="active">Activo</option>
            <option value="completed">Completado</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </label>
        <label>
          Inicio{" "}
          <input
            type="date"
            name="start_date"
            className={fieldClass}
            defaultValue={project.start_date || ""}
            disabled={!editable || busy}
          />
        </label>
        <label>
          Entrega{" "}
          <input
            type="date"
            name="due_date"
            className={fieldClass}
            defaultValue={project.due_date || ""}
            disabled={!editable || busy}
          />
        </label>
        <label>
          Cotización{" "}
          <input
            type="url"
            name="quotation_url"
            className={fieldClass}
            defaultValue={project.quotation_url}
            disabled={!editable || busy}
          />
        </label>
        {project.quotation_url && (
          <a className="text-accent-primary" href={project.quotation_url} target="_blank" rel="noreferrer">
            Ver cotización
          </a>
        )}
        {editable && (
          <button className={buttonClass} disabled={busy}>
            Guardar cambios
          </button>
        )}
      </form>
      <h3 className="font-semibold">Historial de asignaciones</h3>
      <ul>
        {conversation?.assignments.map((a) => (
          <li key={a.id}>
            {name(a.previous_producer_id)} → {name(a.new_producer_id)} · {name(a.actor_id)} ·{" "}
            {new Date(a.created_at).toLocaleString("es-PE")}
          </li>
        ))}
      </ul>
      <h3 className="font-semibold">Comentarios</h3>
      <ul>
        {conversation?.comments.map((c) => (
          <li className="border-b border-subtle py-2" key={c.id}>
            <strong>{name(c.created_by_id)}</strong>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </li>
        ))}
      </ul>
      {editable && (
        <form
          className="flex gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const body = String(new FormData(form).get("body"));
            void act(async () => {
              await service.comment(slug, project.project_id, body);
              form.reset();
            });
          }}
        >
          <label className="flex-1">
            Nuevo comentario{" "}
            <textarea className={`${fieldClass} w-full`} name="body" required maxLength={10000} disabled={busy} />
          </label>
          <button className={buttonClass} disabled={busy}>
            Comentar
          </button>
        </form>
      )}
    </section>
  );
}

export default function CoordinationPage() {
  const { workspaceSlug = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState("pending");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const {
    data,
    error: loadError,
    mutate,
  } = useSWR(["izclick-board", workspaceSlug], () => service.projects(workspaceSlug), { refreshInterval: 15000 });
  const { data: members = [], mutate: refreshRoles } = useSWR(["izclick-roles", workspaceSlug], () =>
    service.roles(workspaceSlug)
  );
  const { data: workload = [], mutate: refreshWorkload } = useSWR(
    ["izclick-workload", workspaceSlug],
    () => service.workload(workspaceSlug),
    { refreshInterval: 15000 }
  );
  const refresh = () => Promise.all([mutate(), refreshWorkload()]);
  const canAssign = data?.role === "coordinator" || data?.role === "superadmin";
  const canCreate = canAssign || data?.role === "commercial";
  const selected = data?.projects.find((p) => p.project_id === params.get("project"));
  if (loadError)
    return (
      <div role="alert" className="p-8">
        La coordinación no está disponible. Comprueba que esté habilitada y que tengas acceso al espacio de trabajo.
      </div>
    );
  if (!data)
    return (
      <p className="p-8" role="status">
        Cargando coordinación…
      </p>
    );
  return (
    <main className="h-full space-y-6 overflow-auto p-6 text-primary">
      <header>
        <h1 className="text-2xl font-semibold">Coordinación y cargas de trabajo</h1>
        <p>Una cola compartida para todo el equipo. {data.role ? roles[data.role] : "Consulta"}</p>
      </header>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {canCreate && (
        <details>
          <summary className="cursor-pointer font-semibold">Crear proyecto</summary>
          <form
            className="mt-3 flex flex-wrap gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const fields = new FormData(form);
              setBusy(true);
              setError("");
              try {
                const project = await service.createProject(workspaceSlug, {
                  name: String(fields.get("name")),
                  identifier: String(fields.get("identifier")),
                  description: String(fields.get("description")),
                  client: String(fields.get("client")),
                  start_date: String(fields.get("start_date")) || null,
                  due_date: String(fields.get("due_date")) || null,
                });
                form.reset();
                await refresh();
                setParams({ project: project.id });
              } catch {
                setError("No se pudo crear el proyecto. Comprueba el nombre y el identificador.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Nombre <input name="name" className={fieldClass} required maxLength={255} />
            </label>
            <label>
              Identificador <input name="identifier" className={fieldClass} required maxLength={12} />
            </label>
            <label>
              Descripción <input name="description" className={fieldClass} />
            </label>
            <label>
              Cliente <input name="client" className={fieldClass} required maxLength={255} />
            </label>
            <label>
              Inicio <input type="date" name="start_date" className={fieldClass} />
            </label>
            <label>
              Entrega <input type="date" name="due_date" className={fieldClass} />
            </label>
            <button className={buttonClass} disabled={busy}>
              Enviar a coordinación
            </button>
          </form>
        </details>
      )}
      <section>
        <h2 className="text-lg font-semibold">Carga de productores</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {workload.map((w) => (
            <article className="rounded border border-subtle p-4" key={w.producer_id}>
              <h3 className="font-semibold">{w.producer_name}</h3>
              <p>
                {w.active_count} activos · {w.overdue_count} vencidos · {w.due_soon_count} entregas en 7 días
              </p>
              <ul>
                {w.projects.map((p) => (
                  <li key={p.project_id}>
                    <button
                      type="button"
                      className="text-accent-primary"
                      onClick={() => setParams({ project: p.project_id })}
                    >
                      {p.project_name}
                    </button>{" "}
                    · {p.client || "Sin cliente"} · {p.due_date || "Sin fecha"}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Proyectos</h2>
        <label>
          Mostrar{" "}
          <select className={fieldClass} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="pending">Pendientes de asignar</option>
            <option value="all">Todos</option>
            <option value="assigned">Asignados</option>
          </select>
        </label>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                {["Proyecto", "Cliente", "Productor", "Entrega", "Estado"].map((label) => (
                  <th className="p-3" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.projects
                .filter((p) => filter === "all" || p.status === filter)
                .map((p) => (
                  <tr key={p.project_id} className="border-t border-subtle">
                    <td className="p-3">
                      <button className="text-accent-primary" onClick={() => setParams({ project: p.project_id })}>
                        {p.project_name}
                      </button>
                    </td>
                    <td>{p.client || "—"}</td>
                    <td>{members.find((m) => m.user_id === p.producer_id)?.name || "Sin asignar"}</td>
                    <td>{p.due_date || "—"}</td>
                    <td>{p.workflow_status}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {data.projects.filter((p) => filter === "all" || p.status === filter).length === 0 && (
          <p>No hay proyectos en esta vista.</p>
        )}
      </section>
      {selected && (
        <ProjectEditor
          key={`${selected.project_id}-${selected.version}`}
          project={selected}
          slug={workspaceSlug}
          members={members}
          assignable={canAssign}
          editable={canAssign || (data.role === "producer" && selected.producer_id === data.current_user_id)}
          refresh={refresh}
        />
      )}
      {data.role === "superadmin" && (
        <section>
          <h2 className="text-lg font-semibold">Roles comerciales</h2>
          {members.map((m) => (
            <label className="mt-2 flex gap-3" key={m.user_id}>
              {m.name} · {m.email}
              <select
                className={fieldClass}
                value={m.role || ""}
                disabled={busy}
                onChange={async (e) => {
                  setBusy(true);
                  setError("");
                  try {
                    await service.setRole(workspaceSlug, m.user_id, e.target.value);
                    await Promise.all([refreshRoles(), refresh()]);
                  } catch {
                    setError("No se pudo cambiar el rol.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <option disabled value="">
                  Sin rol
                </option>
                <option value="commercial">Comercial</option>
                <option value="coordinator">Coordinación</option>
                <option value="producer">Productor</option>
              </select>
            </label>
          ))}
        </section>
      )}
    </main>
  );
}
