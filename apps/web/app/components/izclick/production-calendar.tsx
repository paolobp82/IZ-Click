import { useMemo, useState } from "react";
import type { ProductionWorkItem } from "@/app/lib/izclick/production-metrics";
import { scheduledProductionLoads } from "@/app/lib/izclick/production-schedule";

type Props = {
  issues: readonly ProductionWorkItem[];
  projects: readonly { id: string; name: string }[];
  workspaceSlug: string;
};

/** Cross-project month agenda based on dates actually present in Plane. */
export function ProductionCalendar({ issues, projects, workspaceSlug }: Props) {
  const [monthStart, setMonthStart] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const items = useMemo(() => scheduledProductionLoads(issues), [issues]);
  const projectNames = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
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
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => changeMonth(-1)} aria-label="Mes anterior" className="rounded border border-subtle px-2 py-1">←</button>
          <span className="min-w-32 text-center text-sm capitalize" aria-live="polite">{monthTitle}</span>
          <button type="button" onClick={() => changeMonth(1)} aria-label="Mes siguiente" className="rounded border border-subtle px-2 py-1">→</button>
        </div>
      </div>
      <p className="mb-3 text-sm">{shown.length} {shown.length === 1 ? "carga programada" : "cargas programadas"} este mes</p>
      {grouped.length === 0 ? (
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
