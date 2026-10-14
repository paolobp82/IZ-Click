import { useMemo, useState } from "react";
import type { ProductionState, ProductionWorkItem } from "@/app/lib/izclick/production-metrics";
import { ProductionSigLinkEditor } from "./production-sig-link-editor";

type Props = {
  issues: readonly ProductionWorkItem[];
  states: readonly ProductionState[];
  projects: readonly { id: string; name: string }[];
  clients?: readonly { id: string; name: string; color: string }[];
  workspaceSlug: string;
};

const priorityNames: Record<string, string> = {
  urgent: "Urgente", high: "Alta", medium: "Media", low: "Baja", none: "Sin prioridad",
};

export function ProductionLoadDirectory({ issues, states, projects, clients = [], workspaceSlug }: Props) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const stateNames = useMemo(() => new Map(states.map((s) => [s.id, s.name])), [states]);
  const projectNames = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const filtered = useMemo(() => {
    const seen = new Set<string>();
    const term = query.trim().toLocaleLowerCase("es");
    return issues.filter((issue) => {
      if (!issue.id || !issue.project_id || issue.parent_id || seen.has(issue.id)) return false;
      seen.add(issue.id);
      return !term || [issue.name, projectNames.get(issue.project_id), stateNames.get(issue.state_id || ""), clientById.get(issue.client_id || "")?.name]
        .some((value) => value?.toLocaleLowerCase("es").includes(term));
    });
  }, [issues, query, projectNames, stateNames, clientById]);
  const pageSize = 50;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * pageSize, (current + 1) * pageSize);

  return (
    <section className="rounded-lg border border-subtle bg-surface-1 p-5" aria-label="Directorio de cargas de Producción">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Directorio de cargas</h2>
          <p className="text-sm text-custom-text-300">{filtered.length} cargas; sin duplicar subtareas</p>
        </div>
        <input aria-label="Buscar cargas" placeholder="Buscar carga, proyecto o estado…" value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(0); setSelected(null); }}
          className="w-full max-w-xs rounded border border-subtle bg-surface-1 px-3 py-2 text-sm" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-subtle">
            <th className="py-2 pr-3">Carga</th><th className="py-2 pr-3">Proyecto</th>
            <th className="py-2 pr-3">Cliente</th><th className="py-2 pr-3">Estado</th><th className="py-2 pr-3">Prioridad</th>
            <th className="py-2 pr-3">Fecha prevista</th><th className="py-2">SIG</th>
          </tr></thead>
          <tbody>
            {visible.map((issue) => (
              <tr key={issue.id} className="border-b border-subtle">
                <td className="py-2 pr-3">
                  <a className="underline" href={`/${encodeURIComponent(workspaceSlug)}/projects/${encodeURIComponent(issue.project_id!)}/issues/${encodeURIComponent(issue.id)}`}>
                    {issue.name || "Carga sin nombre"}
                  </a>
                  {selected === issue.id && (
                    <div className="mt-3 min-w-64">
                      <ProductionSigLinkEditor workspaceSlug={workspaceSlug} projectId={issue.project_id!}
                        issueId={issue.id} onClose={() => setSelected(null)} />
                    </div>
                  )}
                </td>
                <td className="py-2 pr-3">{projectNames.get(issue.project_id!) || "Proyecto"}</td>
                <td className="py-2 pr-3">
                  {clientById.get(issue.client_id || "") ? (
                    <span className="inline-flex items-center gap-1">
                      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: clientById.get(issue.client_id!)?.color }} />
                      {clientById.get(issue.client_id!)?.name}
                    </span>
                  ) : "—"}
                </td>
                <td className="py-2 pr-3">{stateNames.get(issue.state_id || "") || "Sin estado"}</td>
                <td className="py-2 pr-3">{priorityNames[issue.priority || "none"] || issue.priority}</td>
                <td className="py-2 pr-3">{issue.target_date || "—"}</td>
                <td className="py-2">
                  <button type="button" aria-expanded={selected === issue.id} onClick={() => setSelected((id) => id === issue.id ? null : issue.id)}
                    className="rounded border border-subtle px-2 py-1 text-xs">
                    {selected === issue.id ? "Cerrar" : "Vincular SIG"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <p className="py-5 text-center text-sm">No hay cargas que coincidan con la búsqueda.</p>}
      {pages > 1 && <div className="mt-3 flex items-center justify-end gap-3 text-sm">
        <button type="button" disabled={current === 0} onClick={() => { setPage((p) => p - 1); setSelected(null); }}
          className="rounded border border-subtle px-2 py-1 disabled:opacity-50">Anterior</button>
        <span>Página {current + 1} de {pages}</span>
        <button type="button" disabled={current >= pages - 1} onClick={() => { setPage((p) => p + 1); setSelected(null); }}
          className="rounded border border-subtle px-2 py-1 disabled:opacity-50">Siguiente</button>
      </div>}
    </section>
  );
}
