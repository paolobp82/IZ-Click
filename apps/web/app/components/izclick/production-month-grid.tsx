import { useMemo } from "react";
import { productionMonthCells } from "@/app/lib/izclick/production-month";
import type { ScheduledLoad } from "@/app/lib/izclick/production-schedule";

type Props = {
  year: number;
  month: number;
  items: readonly ScheduledLoad[];
  workspaceSlug: string;
  projectNames: ReadonlyMap<string, string>;
  clients: ReadonlyMap<string, { id: string; name: string; color: string }>;
  onShowAgenda: () => void;
};

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

/** Month overview, with an agenda alternative when a day has more than 3 cargas. */
export function ProductionMonthGrid({ year, month, items, workspaceSlug, projectNames, clients, onShowAgenda }: Props) {
  const cells = useMemo(() => productionMonthCells(year, month), [year, month]);
  const byDate = useMemo(() => {
    const dates = new Map<string, ScheduledLoad[]>();
    for (const item of items) {
      const found = dates.get(item.date) ?? [];
      found.push(item);
      dates.set(item.date, found);
    }
    return dates;
  }, [items]);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[650px]">
        <div className="grid grid-cols-7 gap-px bg-custom-border-200">
          {DAYS.map((day) => (
            <div key={day} className="bg-surface-1 px-2 py-2 text-center text-xs font-semibold">{day}</div>
          ))}
          {cells.map((date, index) => {
            const loads = date ? byDate.get(date) ?? [] : [];
            return (
              <div key={date ?? `blank-${index}`} className="min-h-[112px] bg-surface-1 p-1.5">
                {date && (
                  <>
                    <div className="mb-1 text-xs font-semibold">{Number(date.slice(-2))}</div>
                    <div className="space-y-1">
                      {loads.slice(0, 3).map((load) => {
                        const client = load.client_id ? clients.get(load.client_id) : null;
                        const kind = load.source === "event_date" ? "Fecha del evento" : "Fecha prevista";
                        return (
                          <a key={load.id}
                            href={`/${encodeURIComponent(workspaceSlug)}/projects/${encodeURIComponent(load.project_id)}/issues/${encodeURIComponent(load.id)}`}
                            className="block truncate rounded border border-subtle px-1 py-1 text-xs hover:underline"
                            title={`${load.name} · ${projectNames.get(load.project_id) ?? "Proyecto"} · ${kind}`}
                          >
                            {client && <span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: client.color }} />}
                            {load.name}
                          </a>
                        );
                      })}
                      {loads.length > 3 && (
                        <button type="button" onClick={onShowAgenda} className="text-xs underline">
                          +{loads.length - 3} más en agenda
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
