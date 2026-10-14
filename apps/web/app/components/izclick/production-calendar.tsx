import { useMemo, useState } from "react";
import type { ProductionWorkItem } from "@/app/lib/izclick/production-metrics";
import { scheduledProductionLoads } from "@/app/lib/izclick/production-schedule";
import { ProductionMonthGrid } from "@/app/components/izclick/production-month-grid";

type Props = {
  issues: readonly ProductionWorkItem[];
  projects: readonly { id: string; name: string }[];
  clients?: readonly { id: string; name: string; color: string }[];
  workspaceSlug: string;
};

/** Cross-project month agenda based on dates actually present in Plane. */
export function ProductionCalendar({ issues, projects, clients = [], workspaceSlug }: Props) {
  const [mode, setMode] = useState<"month" | "agenda">("month");
  const [monthStart, setMonthStart] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const items = useMemo(() => scheduledProductionLoads(issues), [issues]);
  const projectNames = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const month = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;
  const shown = useMemo(() => items.filter((item) => item.date.startsWith(month)), [items, month]);
  const grouped = useMemo(() => {
    const map = new Map<string, typeof shown>();
    for (const item of shown) map.set(item.date, [...(map.get(item.date) ?? []), item]);
    return [...map.entries()];
  }, [shown]);
  const monthTitle = new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric" }).format(monthStart);
  const changeMonth = (offset: number) => setMonthStart((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));

  return (
    <section className="rounded-lg border border-subtle bg-surface-1 p-5" aria-label="Agenda consolidada de Producción">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Calendario de cargas</h2>
          <p className="mt-1 text-xs text-custom-text-300">
            Las fechas previstas corresponden al vencimiento de Plane; no sustituyen la fecha específica del evento.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded border border-subtle p-0.5">
            <button type="button" aria-pressed={mode === "month"} onClick={() => setMode("month")}
              className={`rounded px-2 py-1 text-xs ${mode === "month" ? "font-semibold underline" : ""}`}>Mes</button>
            <button type="button" aria-pressed={mode === "agenda"} onClick={() => setMode("agenda")}
              className={`rounded px-2 py-1 text-xs ${mode === "agenda" ? "font-semibold underline" : ""}`}>Agenda</button>
          </div>
          <button type="button" onClick={() => changeMonth(-1)} aria-label="Mes anterior" className="rounded border border-subtle px-2 py-1">←</button>
          <span className="min-w-32 text-center text-sm capitalize" aria-live="polite">{monthTitle}</span>
          <button type="button" onClick={() => changeMonth(1)} aria-label="Mes siguiente" className="rounded border border-subtle px-2 py-1">→</button>
        </div>
      </div>
      <p className="mb-3 text-sm">{shown.length} {shown.length === 1 ? "carga programada" : "cargas programadas"} este mes</p>
      {mode === "month" ? (
        <ProductionMonthGrid year={monthStart.getFullYear()} month={monthStart.getMonth() + 1}
          items={shown} workspaceSlug={workspaceSlug} projectNames={projectNames} clients={clientById}
          onShowAgenda={() => setMode("agenda")} />
      ) : grouped.length === 0 ? (
        <p className="py-4 text-sm text-custom-text-300">No hay cargas con fecha registrada para este mes.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {grouped.map(([day, rows]) => (
            <div key={day} className="rounded border border-subtle p-3">
              <h3 className="mb-2 text-sm font-semibold">{new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}</h3>
              <ul className="flex flex-col gap-2">
                {rows.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div>
                      <a className="font-medium underline" href={`/${encodeURIComponent(workspaceSlug)}/projects/${encodeURIComponent(item.project_id)}/issues/${encodeURIComponent(item.id)}`}>
                        {item.name}
                      </a>
                      <p className="text-xs text-custom-text-300">
                        {projectNames.get(item.project_id) ?? "Proyecto"} · {item.source === "event_date" ? "Fecha del evento" : "Fecha prevista (Plane)"}
                        {item.client_id && clientById.get(item.client_id) && (
                          <span className="ml-2 inline-flex items-center gap-1">
                            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: clientById.get(item.client_id)?.color }} />
                            {clientById.get(item.client_id)?.name}
                          </span>
                        )}
                      </p>
                    </div>
                    {item.priority !== "none" && <span className="text-xs">{item.priority}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
