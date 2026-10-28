import { useCallback, useEffect, useMemo, useState } from "react";
import { ProjectStateService } from "@/services/project";
import { missingProductionStates, segmentProductionStates } from "@/app/lib/izclick/production-state-presets";
import type { ProductionStatePreset } from "@/app/lib/izclick/production-state-presets";

type Props = { workspaceSlug: string; projectId: string };
type State = { id: string; name: string; group: string };
/** No automatic mutations: a project administrator must click the action. */
export function ProductionStatesSetup({ workspaceSlug, projectId }: Props) {
  const service = useMemo(() => new ProjectStateService(), []);
  const [states, setStates] = useState<State[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const missing: ProductionStatePreset[] = useMemo(() => missingProductionStates(states), [states]);

  const reload = useCallback(async () => {
    const payload = await service.getStates(workspaceSlug, projectId);
    if (!Array.isArray(payload)) throw new Error("Plane devolvió estados no reconocidos");
    setStates(payload);
  }, [service, workspaceSlug, projectId]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    service.getStates(workspaceSlug, projectId)
      .then((payload) => {
        if (live) {
          if (!Array.isArray(payload)) throw new Error("Plane devolvió estados no reconocidos");
          setStates(payload);
        }
      })
      .catch(() => { if (live) setError("No se pudieron consultar los estados del proyecto"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [service, workspaceSlug, projectId]);

  const addMissing = async () => {
    if (saving || loading || error || missing.length === 0) return;
    setSaving(true);
    setReport(null);
    try {
      let created = 0;
      // Refresh before each create to minimize duplicates from stale project state.
      for (const wanted of missing) {
        const current = await service.getStates(workspaceSlug, projectId);
        if (!Array.isArray(current)) throw new Error("No se pudo verificar el proyecto antes de modificar");
        if (!missingProductionStates(current).some((state) => state.name === wanted.name)) continue;
        await service.createState(workspaceSlug, projectId, {
          name: wanted.name, group: wanted.group, color: wanted.color,
          description: "Flujo de Producción IZ-Click",
        });
        created++;
      }
      await reload();
      setReport(`Se añadieron ${created} estados nuevos. Los estados anteriores siguen intactos.`);
    } catch {
      await reload().catch(() => undefined);
      setError("No se pudieron agregar todos los estados. Solo administradores del proyecto pueden hacerlo; revisa los existentes.");
    } finally { setSaving(false); }
  };

  return (
    <section className="rounded-lg border border-subtle bg-surface-1 p-4" aria-label="Estados de Producción">
      <h2 className="mb-1 text-base font-semibold">Estados operativos de Producción</h2>
      <p className="mb-3 text-sm text-custom-text-300">
        Los estados se configuran por proyecto. Solamente un administrador puede agregarlos. No se eliminan estados existentes ni se reasignan cargas.
      </p>
      {loading ? <p role="status">Consultando estados…</p> : (
        <>
          <div className="flex flex-wrap gap-2">
            {missing.length > 0 ? segmentProductionStates(missing).filter(segment => segment.states.length > 0).map(segment => <div key={segment.value} className="w-full"><h3 className="my-2 text-sm font-semibold uppercase">{segment.label}</h3><div className="flex flex-wrap gap-2">{segment.states.map((state) => (
              <span key={state.name} className="inline-flex items-center gap-2 rounded border border-subtle px-2 py-1 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: state.color }} />
                {state.name}
              </span>
            ))}</div></div>) : <p className="text-sm">Los 20 estados propuestos ya existen en este proyecto.</p>}
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
          {report && <p role="status" className="mt-3 text-sm">{report}</p>}
          {missing.length > 0 && <p className="mt-3 text-xs text-custom-text-300">Si tu usuario no es administrador del proyecto, solicita que un administrador realice esta configuración.</p>}
          {missing.length > 0 && <button type="button" onClick={addMissing}
            disabled={saving || Boolean(error)}
            className="mt-3 rounded border border-subtle px-3 py-1.5 text-sm disabled:opacity-50">
            {saving ? "Agregando estados…" : `Agregar ${missing.length} estados de Producción`}
          </button>}
        </>
      )}
    </section>
  );
}
