import { API_BASE_URL } from "@plane/constants";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useProjectState } from "@/hooks/store/use-project-state";

import { segmentProductionStates } from "@/app/lib/izclick/production-state-presets";

const STATE_COLORS = ["#64748b", "#eab308", "#f97316", "#3b82f6", "#8b5cf6", "#22c55e", "#ef4444", "#ec4899"];
type StateGroup = "backlog" | "unstarted" | "started" | "completed" | "cancelled";

type Props = { projectId: string; canEdit: boolean };

/** Edits the project's native Plane states; never creates a parallel workflow. */
export const ProductionStateManager = observer(function ProductionStateManager({ projectId, canEdit }: Props) {
  const { workspaceSlug } = useParams();
  const slug = String(workspaceSlug ?? "");
  const { getProjectStates, createState, updateState, fetchProjectStates } = useProjectState();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(288, window.innerWidth - 32);
      const left = Math.max(16, Math.min(window.innerWidth - width - 16, rect.left));
      const top = window.innerHeight - rect.bottom >= 320
        ? rect.bottom + 6
        : Math.max(16, rect.top - Math.min(window.innerHeight * 0.7, 410) - 6);
      setPanelPosition({ top, left });
    };
    updatePosition();
    const handleOutside = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!rootRef.current?.contains(node) && !panelRef.current?.contains(node)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); setEditingId(null); }
    };
    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [group, setGroup] = useState<StateGroup>("unstarted");
  const [color, setColor] = useState(STATE_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [replacementId, setReplacementId] = useState("");
  const states = getProjectStates(projectId) ?? [];

  const startNew = () => {
    setEditingId("");
    setName("");
    setColor(STATE_COLORS[0]);
    setGroup("unstarted");
    setError("");
  };

  const startEdit = (state: (typeof states)[number]) => {
    setEditingId(state.id);
    setReplacementId("");
    setName(state.name);
    setColor(state.color ?? STATE_COLORS[0]);
    setGroup(state.group as StateGroup);
    setError("");
  };

  const save = async () => {
    if (!canEdit || !slug || !projectId || busy) return;
    if (!name.trim()) { setError("El nombre es obligatorio."); return; }
    if (states.some((state) => state.name.trim().toLowerCase() === name.trim().toLowerCase() && state.id !== editingId)) {
      setError("Ya existe un estado con ese nombre."); return;
    }
    setBusy(true);
    setError("");
    try {
      if (editingId) {
        // Keep the workflow group intact when editing a pre-existing state.
        await updateState(slug, projectId, editingId, { name: name.trim(), color });
      } else {
        await createState(slug, projectId, { name: name.trim(), color, group });
      }
      setEditingId(null);
    } catch {
      setError("No se pudo guardar. Comprueba tus permisos para administrar estados.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!canEdit || !editingId || !replacementId || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`${(API_BASE_URL || "").replace(/\/$/, "")}/api/workspaces/${encodeURIComponent(slug)}/projects/${projectId}/production-states/${editingId}/retire/`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ replacement_id: replacementId }),
      });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "No se pudo eliminar el estado."); }
      // Refresh both task rows and state maps after the atomic reassignment.
      window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo eliminar."); }
    finally { setBusy(false); }
  };
  if (!canEdit || !slug) return null;
  return (
    <span ref={rootRef} className="relative shrink-0">
      <button type="button" className="rounded px-1 text-tertiary hover:bg-layer-1-hover"
        aria-label="Administrar estados del proyecto" title="Crear, editar o eliminar estados"
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen(!open); setEditingId(null); }}>⋯</button>
      {open && createPortal(
        <span ref={panelRef} data-izclick-popover role="dialog" aria-label="Administrar estados del proyecto" className="fixed z-[1000] block max-h-[70vh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded border border-subtle bg-surface-1 p-3 text-xs shadow-lg" style={{ top: panelPosition.top, left: panelPosition.left }}
          onClick={(event) => event.stopPropagation()}>
          <span className="mb-2 flex items-center justify-between font-semibold">
            Estados del proyecto
            <button type="button" className="px-1" onClick={() => setOpen(false)}>Cerrar</button>
          </span>
          {editingId === null ? (
            <span className="block">
              <span className="block max-h-52 overflow-y-auto">
                {segmentProductionStates(states).map(segment => <span key={segment.value} className="block" role="group" aria-label={`Segmento ${segment.label}`}><span className="block px-2 py-2 font-semibold uppercase">{segment.label}</span>{segment.states.map((state) => (
                  <span key={state.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-layer-1-hover">
                    <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: state.color }} />
                    <span className="min-w-0 flex-1 truncate" title={state.name}>{state.name}</span>
                    <button type="button" aria-label={`Editar estado ${state.name}`} onClick={() => startEdit(state)}
                      className="shrink-0 text-tertiary underline">Editar</button>
                    <button type="button" aria-label={`Eliminar estado ${state.name}`} onClick={() => startEdit(state)}
                      className="shrink-0 text-red-500 underline">Eliminar</button>
                  </span>
                ))}</span>)}
              </span>
              <button type="button" className="mt-2 w-full rounded border border-subtle p-2 text-left hover:bg-layer-1-hover"
                onClick={startNew}>+ Crear estado</button>
            </span>
          ) : (
            <span className="block space-y-2">
              <label className="block">Nombre
                <input className="mt-1 w-full rounded border border-subtle bg-surface-1 px-2 py-1" maxLength={100}
                  value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              {editingId === "" && <label className="block">Grupo
                <select className="mt-1 w-full rounded border border-subtle bg-surface-1 px-2 py-1"
                  value={group} onChange={(event) => setGroup(event.target.value as StateGroup)}>
                  <option value="backlog">Pendiente</option>
                  <option value="unstarted">Por hacer</option>
                  <option value="started">En progreso</option>
                  <option value="completed">Completado</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </label>}
              <span className="block">Color
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  {STATE_COLORS.map((choice) => (
                    <button key={choice} type="button" aria-label={`Color ${choice}`}
                      aria-pressed={color === choice} onClick={() => setColor(choice)}
                      className="size-6 rounded-full border-2"
                      style={{ backgroundColor: choice, borderColor: color === choice ? "white" : "transparent" }} />
                  ))}
                  <input type="color" aria-label="Color personalizado" value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#64748b"}
                    onChange={(event) => setColor(event.target.value)} />
                </span>
              </span>
              {editingId && <span className="mt-3 block border-t border-subtle pt-2">
                <label className="block">Mover sus tareas al estado
                  <select aria-label="Estado de destino" value={replacementId} onChange={event => setReplacementId(event.target.value)} disabled={busy}
                    className="mt-1 w-full rounded border border-subtle bg-surface-1 p-1">
                    <option value="">Seleccionar destino</option>
                    {states.filter(state => state.id !== editingId).map(state => <option key={state.id} value={state.id}>{state.name}</option>)}
                  </select>
                </label>
                <p className="my-2">Se conservarán las tareas y su historial. Si era el estado predeterminado, el destino pasará a serlo.</p>
                <button type="button" disabled={busy || !replacementId} onClick={() => void remove()} className="text-red-500 underline disabled:opacity-50">Eliminar estado y mover tareas</button>
              </span>}
              {error && <span role="alert" className="block text-red-500">{error}</span>}
              <span className="flex justify-end gap-2">
                <button type="button" disabled={busy} onClick={() => { setEditingId(null); setError(""); }}>Cancelar</button>
                <button type="button" disabled={busy} onClick={() => void save()}
                  className="rounded bg-accent-primary px-3 py-1.5 text-white">Guardar</button>
              </span>
            </span>
          )}
        </span>, document.body
      )}
    </span>
  );
});
