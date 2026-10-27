import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@headlessui/react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useParams } from "next/navigation";
import { ProductionStatusesService } from "@/services/project/izclick-production-status.service";
import type { WorkspaceProductionStatus, StatusValues } from "@/services/project/izclick-production-status.service";
import { useUserPermissions } from "@/hooks/store/user";
import { useProjectState } from "@/hooks/store/use-project-state";

const STATUS_GROUPS: readonly { value: StatusValues["group"]; label: string }[] = [
  { value: "backlog", label: "Pendiente" },
  { value: "unstarted", label: "Por iniciar" },
  { value: "started", label: "En curso" },
  { value: "completed", label: "Finalizado" },
  { value: "cancelled", label: "Cancelado" },
];
const INITIAL: StatusValues = {
  name: "", color: "#64748b", group: "unstarted", sequence: 1000,
};

/** A single workspace catalogue accessible from the native issue header. */
export function ProductionStatusesMenu() {
  const { workspaceSlug: slugParam } = useParams();
  const workspaceSlug = slugParam?.toString() ?? "";
  const { allowPermissions } = useUserPermissions();
  const { fetchWorkspaceStates } = useProjectState();
  const canManage = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, workspaceSlug);
  const service = useMemo(() => new ProductionStatusesService(), []);
  const [open, setOpen] = useState(false);
  const [retiring, setRetiring] = useState<string | null>(null);
  const [replacementId, setReplacementId] = useState("");
  const [statuses, setStatuses] = useState<WorkspaceProductionStatus[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [values, setValues] = useState<StatusValues>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !workspaceSlug) return;
    let active = true;
    setLoading(true);
    setError("");
    service.list(workspaceSlug)
      .then((list) => { if (active) setStatuses(Array.isArray(list) ? list : []); })
      .catch(() => { if (active) setError("No se pudieron consultar los estados de Producción."); })
      .finally(() => { if (active) setLoading(false); });
  return () => { active = false; };
  }, [open, workspaceSlug, service]);

  const edit = (entry: WorkspaceProductionStatus) => {
    setRetiring(null);
    setEditing(entry.id);
    setValues({ name: entry.name, color: entry.color, group: entry.group, sequence: entry.sequence });
    setError("");
  };
  const save = async () => {
    if (!canManage || saving) return;
    setError("");
    if (!values.name.trim()) { setError("Escribe un nombre para el estado."); return; }
    setSaving(true);
    try {
      if (editing) await service.update(workspaceSlug, editing, values);
      else await service.create(workspaceSlug, values);
      const list = await service.list(workspaceSlug);
      setStatuses(list);
      setValues(INITIAL);
      setEditing(null);
      await fetchWorkspaceStates(workspaceSlug);
    } catch (err: unknown) {
      const response = err as { response?: { data?: { error?: string } } };
      setError(response?.response?.data?.error || "No se pudo guardar. Revisa el nombre o los permisos.");
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!canManage || !retiring || !replacementId || saving) return;
    setSaving(true); setError("");
    try {
      await service.remove(workspaceSlug, retiring, replacementId);
      // The removal may touch several projects; discard all stale task/state maps.
      window.location.reload();
    } catch (cause) {
      const response = cause as { response?: { data?: { error?: string } } };
      setError(response.response?.data?.error || "No se pudo eliminar. Ninguna tarea debe quedar sin destino.");
    } finally { setSaving(false); }
  };

  return (
    <div className="relative">
      <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}
        className="h-8 rounded-md border border-subtle px-3 text-xs hover:bg-layer-1">
        Estados
      </button>
      {open && (
        <section role="dialog" aria-label="Estados generales de Producción"
          className="fixed right-5 top-24 z-[1000] max-h-[78vh] w-[min(420px,calc(100vw-32px))] overflow-y-auto rounded-lg border border-subtle bg-surface-1 p-4 shadow-xl">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Estados de Producción</h2>
            <button type="button" onClick={() => setOpen(false)} className="rounded px-2 py-1 text-xs hover:bg-layer-2">
              Cerrar
            </button>
          </header>
          <p className="mb-3 text-xs text-custom-text-300">
            Todos los estados, incluidos los originales de Plane. Los cambios se aplican a los proyectos indicados.
          </p>
          {loading ? <p role="status" className="text-xs">Consultando estados…</p> : (
            <div className="space-y-1.5">
              {statuses.length === 0 && <p className="text-xs text-custom-text-300">
                No hay estados disponibles.
              </p>}
              {statuses.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between rounded border border-subtle px-3 py-2 text-xs">
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span>{entry.name}<span className="block text-custom-text-300">{entry.origin === "plane" ? "Plane · " : ""}{entry.project_count} proyecto{entry.project_count !== 1 ? "s" : ""} · {STATUS_GROUPS.find(group => group.value === entry.group)?.label}</span></span>
                  </span>
                  {canManage && <span className="flex gap-2"><button type="button" disabled={saving} className="underline" onClick={() => edit(entry)}>Editar</button><button type="button" disabled={saving} className="text-red-500 underline" onClick={() => { setRetiring(entry.id); setEditing(null); setValues(INITIAL); setReplacementId(""); setError(""); }}>Eliminar</button></span>}
                </div>
              ))}
            </div>
          )}
          {canManage ? (
            <div className="mt-4 border-t border-subtle pt-3">
              <h3 className="mb-2 text-xs font-semibold">{editing ? "Editar estado" : "Agregar estado"}</h3>
              <div className="space-y-2">
                <label className="block text-xs">Nombre
                  <input maxLength={120} value={values.name}
                    onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                    className="mt-1 h-8 w-full rounded border border-subtle bg-surface-1 px-2" placeholder="Ej.: Enviado a comercial"/>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs">Color
                    <input type="color" value={values.color}
                      onChange={(e) => setValues((v) => ({ ...v, color: e.target.value }))}
                      className="mt-1 h-8 w-full rounded border border-subtle bg-surface-1" />
                  </label>
                  <label className="text-xs">Grupo
                    <select value={values.group} onChange={(e) => setValues((v) => ({ ...v, group: e.target.value as StatusValues["group"] }))}
                      className="mt-1 h-8 w-full rounded border border-subtle bg-surface-1 px-2">
                      {STATUS_GROUPS.map((group) => <option key={group.value} value={group.value}>{group.label}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              {error && !retiring && <p role="alert" className="my-2 text-xs text-red-500">{error}</p>}
              <div className="mt-3 flex items-center gap-3">
                <button type="button" disabled={saving} onClick={() => void save()}
                  className="rounded bg-custom-primary-100 px-3 py-2 text-xs text-white disabled:opacity-50">
                  {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear estado general"}
                </button>
                {editing && <button type="button" className="text-xs underline" onClick={() => { setEditing(null); setValues(INITIAL); setError(""); }}>
                  Cancelar
                </button>}
              </div>
            </div>
          ) : <p className="mt-3 text-xs text-custom-text-300">
            Solo un administrador del espacio puede editar el catálogo.
          </p>}
          {!canManage && error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
        </section>
      )}
      <Dialog open={Boolean(canManage && retiring)} onClose={() => { if (!saving) setRetiring(null); }} className="relative z-[1200]">
        <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
          <Dialog.Panel onClick={event => event.stopPropagation()} className="w-full max-w-lg space-y-4 rounded-lg border border-subtle bg-surface-1 p-5 text-sm shadow-xl">
            <Dialog.Title className="font-semibold">Eliminar estado: {statuses.find(entry => entry.id === retiring)?.name}</Dialog.Title>
            <Dialog.Description>Elige dónde mover todas sus tareas y subtareas en los proyectos indicados. Se conservará su historial.</Dialog.Description>
            <select aria-label="Estado general de destino" value={replacementId} onChange={event => setReplacementId(event.target.value)} disabled={saving} className="w-full rounded border border-subtle bg-surface-1 p-2">
              <option value="">Seleccionar destino</option>
              {statuses.filter(entry => entry.id !== retiring).map(entry => <option key={entry.id} value={entry.id}>{entry.name}{entry.origin === "plane" ? " (Plane)" : ""} · {STATUS_GROUPS.find(group => group.value === entry.group)?.label} · {entry.project_count} proyectos</option>)}
            </select>
            {error && <p role="alert" className="text-red-500">{error}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" disabled={saving} onClick={() => { setRetiring(null); setError(""); }}>Cancelar</button>
              <button type="button" disabled={saving || !replacementId} onClick={() => void remove()} className="text-red-500 underline disabled:opacity-50">{saving ? "Trasladando tareas…" : "Confirmar eliminación y traslado"}</button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}
