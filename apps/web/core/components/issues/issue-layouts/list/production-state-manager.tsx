import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useProjectState } from "@/hooks/store/use-project-state";

const STATE_COLORS = ["#64748b", "#eab308", "#f97316", "#3b82f6", "#8b5cf6", "#22c55e", "#ef4444", "#ec4899"];
type StateGroup = "backlog" | "unstarted" | "started" | "completed" | "cancelled";

type Props = { projectId: string; canEdit: boolean };

/** Edits the project's native Plane states; never creates a parallel workflow. */
export const ProductionStateManager = observer(function ProductionStateManager({ projectId, canEdit }: Props) {
  const { workspaceSlug } = useParams();
  const slug = String(workspaceSlug ?? "");
  const { getProjectStates, createState, updateState } = useProjectState();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); setEditingId(null); }
    };
    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => { document.removeEventListener("pointerdown", handleOutside); document.removeEventListener("keydown", handleEscape); };
  }, [open]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [group, setGroup] = useState<StateGroup>("unstarted");
  const [color, setColor] = useState(STATE_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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

  if (!canEdit || !slug) return null;
  return (
    <span ref={rootRef} className="relative shrink-0">
      <button type="button" className="rounded px-1 text-tertiary hover:bg-layer-1-hover"
        aria-label="Administrar estados del proyecto" title="Crear o editar estados y colores"
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen(!open); setEditingId(null); }}>⋯</button>
      {open && (
        <span data-izclick-popover className="absolute left-0 top-full z-[80] block w-72 rounded border border-subtle bg-surface-1 p-3 text-xs shadow-lg"
          onClick={(event) => event.stopPropagation()}>
          <span className="mb-2 flex items-center justify-between font-semibold">
            Estados del proyecto
            <button type="button" className="px-1" onClick={() => setOpen(false)}>Cerrar</button>
          </span>
          {editingId === null ? (
            <span className="block">
              <span className="block max-h-52 overflow-y-auto">
                {states.map((state) => (
                  <button key={state.id} type="button" onClick={() => startEdit(state)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-layer-1-hover">
                    <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: state.color }} />
                    <span className="truncate">{state.name}</span>
                    <span className="ml-auto text-tertiary">Editar</span>
                  </button>
                ))}
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
              {error && <span role="alert" className="block text-red-500">{error}</span>}
              <span className="flex justify-end gap-2">
                <button type="button" disabled={busy} onClick={() => { setEditingId(null); setError(""); }}>Cancelar</button>
                <button type="button" disabled={busy} onClick={() => void save()}
                  className="rounded bg-accent-primary px-3 py-1.5 text-white">Guardar</button>
              </span>
            </span>
          )}
        </span>
      )}
    </span>
  );
});
