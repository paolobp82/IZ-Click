import { groupLoadsByProducer } from "@/app/lib/izclick/production-producers";
import { useEffect, useMemo, useState } from "react";
import { defaultProductionColumns, parseProductionColumns, PRODUCTION_COLUMNS } from "@/app/lib/izclick/production-columns";
import type { ProductionColumnId } from "@/app/lib/izclick/production-columns";
import type { ProductionState, ProductionWorkItem } from "@/app/lib/izclick/production-metrics";

type Props = {
  issues: readonly ProductionWorkItem[];
  states: readonly ProductionState[];
  projects: readonly { id: string; name: string }[];
  clients?: readonly { id: string; name: string; color: string }[];
  members?: readonly { id: string; name: string }[];
  workspaceSlug: string;
};

const priorityNames: Record<string, string> = {
  urgent: "Urgente", high: "Alta", medium: "Media", low: "Baja", none: "Sin prioridad",
};

export function ProductionLoadDirectory({ issues, states, projects, clients = [], members = [], workspaceSlug }: Props) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"estados" | "tabla" | "productores">("estados");
  const [page, setPage] = useState(0);
  const [columns, setColumns] = useState(defaultProductionColumns);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const storageKey = `izclick:production:columns:${workspaceSlug}`;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      setColumns(saved ? parseProductionColumns(JSON.parse(saved)) : defaultProductionColumns());
    } catch {
      setColumns(defaultProductionColumns());
    }
  }, [storageKey]);

  const changeColumn = (id: ProductionColumnId, enabled: boolean) => {
    const updated = { ...columns, [id]: enabled };
    setColumns(updated);
    try { window.localStorage.setItem(storageKey, JSON.stringify(updated)); } catch { /* Storage unavailable: per-session only */ }
  };
  const stateNames = useMemo(() => new Map(states.map((s) => [s.id, s.name])), [states]);
  const projectNames = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const filtered = useMemo(() => {
    const seen = new Set<string>();
    const term = query.trim().toLocaleLowerCase("es");
    return issues.filter((issue) => {
      if (!issue.id || !issue.project_id || issue.parent_id || seen.has(issue.id)) return false;
      seen.add(issue.id);
      return !term || [issue.name, String(issue.sequence_id ?? ""), projectNames.get(issue.project_id), stateNames.get(issue.state_id || ""), clientById.get(issue.client_id || "")?.name]
        .some((value) => value?.toLocaleLowerCase("es").includes(term));
    });
  }, [issues, query, projectNames, stateNames, clientById]);
  const groupedByState = useMemo(() => {
    const groups = new Map<string, ProductionWorkItem[]>();
    const knownStateIds = new Set(states.map((state) => state.id));
    for (const issue of filtered) {
      const state = issue.state_id && knownStateIds.has(issue.state_id) ? issue.state_id : "__none__";
      groups.set(state, [...(groups.get(state) || []), issue]);
    }
    const ordered = states.filter((state) => groups.has(state.id)).map((state) => ({
      key: state.id, name: state.name, color: state.color || "#64748b", issues: groups.get(state.id)!,
    }));
    if (groups.has("__none__")) ordered.push({ key: "__none__", name: "Sin estado", color: "#64748b", issues: groups.get("__none__")! });
    return ordered;
  }, [filtered, states]);
  const groupedByProducer = useMemo(() => groupLoadsByProducer(filtered, members), [filtered, members]);
  const codeOf = (issue: ProductionWorkItem) =>
    typeof issue.sequence_id === "number" ? String(issue.sequence_id) : "—";
  const issueHref = (issue: ProductionWorkItem) =>
    `/${encodeURIComponent(workspaceSlug)}/projects/${encodeURIComponent(issue.project_id!)}/issues/${encodeURIComponent(issue.id)}`;
  const pageSize = 50;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * pageSize, (current + 1) * pageSize);

  return (
    <section id="cargas" className="scroll-mt-20 rounded-lg border border-subtle bg-surface-1 p-5" aria-label="Directorio de cargas de Producción">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Cargas de todos los proyectos</h2>
          <p className="text-sm text-custom-text-300">{filtered.length} cargas; sin duplicar subtareas</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded border border-subtle p-0.5" role="group" aria-label="Tipo de vista">
            <button type="button" aria-pressed={view === "estados"} onClick={() => setView("estados")}
              className={`rounded px-3 py-1.5 text-sm ${view === "estados" ? "font-semibold underline" : ""}`}>Por estados</button>
            <button type="button" aria-pressed={view === "productores"} onClick={() => setView("productores")} className={`rounded px-3 py-1.5 text-sm ${view === "productores" ? "font-semibold underline" : ""}`}>Por productor</button>
            <button type="button" aria-pressed={view === "tabla"} onClick={() => setView("tabla")}
              className={`rounded px-3 py-1.5 text-sm ${view === "tabla" ? "font-semibold underline" : ""}`}>Tabla</button>
          </div>
          <button type="button" aria-expanded={showColumnPicker} onClick={() => setShowColumnPicker((value) => !value)}
            className="rounded border border-subtle px-3 py-2 text-sm">Columnas</button>
          <input aria-label="Buscar cargas" placeholder="Buscar carga, proyecto o estado…" value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(0); }}
            className="w-full max-w-xs rounded border border-subtle bg-surface-1 px-3 py-2 text-sm" />
        </div>
      </div>
      {view === "tabla" && showColumnPicker && (
        <fieldset className="mb-4 flex flex-wrap gap-3 rounded border border-subtle p-3">
          <legend className="px-1 text-sm font-medium">Mostrar columnas</legend>
          {PRODUCTION_COLUMNS.map((column) => (
            <label key={column.id} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={columns[column.id]}
                onChange={(e) => changeColumn(column.id, e.target.checked)} />
              {column.label}
            </label>
          ))}
        </fieldset>
      )}
      {view === "productores" && <p className="mb-3 text-xs text-tertiary">Una carga compartida aparece una vez por cada productor asignado; el total de cargas sigue siendo único.</p>}
      {(view === "estados" || view === "productores") && (
        <div className="flex min-h-48 gap-3 overflow-x-auto pb-4" aria-label={view === "estados" ? "Cargas agrupadas por estado" : "Cargas agrupadas por productor"}>
          {(view === "estados" ? groupedByState : groupedByProducer).map((group) => (
            <section key={group.key} className="w-72 shrink-0 rounded-md border border-subtle bg-surface-1 p-3">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.color }} />
                {group.name} <span className="ml-auto">{group.issues.length}</span>
              </h3>
              <div className="flex flex-col gap-2">
                {group.issues.map((issue) => (
                  <article key={issue.id} className="rounded border border-subtle p-3">
                    <div className="mb-1 text-xs text-custom-text-300">Carga {codeOf(issue)}</div>
                    <a href={issueHref(issue)} className="text-sm font-medium underline">{issue.name || "Carga sin nombre"}</a>
                    <div className="mt-2 text-xs text-custom-text-300">
                      {projectNames.get(issue.project_id!) || "Proyecto"}
                      {issue.target_date ? ` · Prevista: ${issue.target_date}` : ""}
                    </div>
                    {clientById.get(issue.client_id || "") && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: clientById.get(issue.client_id!)?.color }} />
                        {clientById.get(issue.client_id!)?.name}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
          {filtered.length === 0 && <p className="py-5 text-sm">No hay cargas que coincidan con la búsqueda.</p>}
        </div>
      )}
      {view === "tabla" && <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-subtle">
            <th className="py-2 pr-3">N.º</th><th className="py-2 pr-3">Carga</th>{columns.project && <th className="py-2 pr-3">Proyecto</th>}
            {columns.client && <th className="py-2 pr-3">Cliente</th>}{columns.state && <th className="py-2 pr-3">Estado</th>}{columns.priority && <th className="py-2 pr-3">Prioridad</th>}
            {columns.targetDate && <th className="py-2 pr-3">Fecha prevista</th>}{columns.eventDate && <th className="py-2 pr-3">Fecha del evento</th>}{columns.sig && <th className="py-2">SIG</th>}
          </tr></thead>
          <tbody>
            {visible.map((issue) => (
              <tr key={issue.id} className="border-b border-subtle">
                <td className="py-2 pr-3 font-semibold">{codeOf(issue)}</td>
                <td className="py-2 pr-3">
                  <a className="underline" href={issueHref(issue)}>
                    {issue.name || "Carga sin nombre"}
                  </a>
                </td>
                {columns.project && <td className="py-2 pr-3">{projectNames.get(issue.project_id!) || "Proyecto"}</td>}
                {columns.client && <td className="py-2 pr-3">
                  {clientById.get(issue.client_id || "") ? (
                    <span className="inline-flex items-center gap-1">
                      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: clientById.get(issue.client_id!)?.color }} />
                      {clientById.get(issue.client_id!)?.name}
                    </span>
                  ) : "—"}
                </td>}
                {columns.state && <td className="py-2 pr-3">{stateNames.get(issue.state_id || "") || "Sin estado"}</td>}
                {columns.priority && <td className="py-2 pr-3">{priorityNames[issue.priority || "none"] || issue.priority}</td>}
                {columns.targetDate && <td className="py-2 pr-3">{issue.target_date || "—"}</td>}
                {columns.eventDate && <td className="py-2 pr-3">{issue.event_date || "—"}</td>}
                {columns.sig && <td className="py-2">
                  {issue.sig_code && issue.sig_url ? (
                    <a href={issue.sig_url} target="_blank" rel="noopener noreferrer"
                      className="text-sm font-medium underline" title="Abrir proyecto SIG">
                      {issue.sig_code} ↗
                    </a>
                  ) : "—"}
                  <a href={issueHref(issue)} className="ml-2 text-xs underline"
                    title="Editar SIG y fecha desde la carga nativa">Abrir carga</a>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
      {view === "tabla" && filtered.length === 0 && <p className="py-5 text-center text-sm">No hay cargas que coincidan con la búsqueda.</p>}
      {view === "tabla" && pages > 1 && <div className="mt-3 flex items-center justify-end gap-3 text-sm">
        <button type="button" disabled={current === 0} onClick={() => { setPage((p) => p - 1);  }}
          className="rounded border border-subtle px-2 py-1 disabled:opacity-50">Anterior</button>
        <span>Página {current + 1} de {pages}</span>
        <button type="button" disabled={current >= pages - 1} onClick={() => { setPage((p) => p + 1);  }}
          className="rounded border border-subtle px-2 py-1 disabled:opacity-50">Siguiente</button>
      </div>}
    </section>
  );
}
