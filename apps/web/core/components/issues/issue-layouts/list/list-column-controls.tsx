import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { API_BASE_URL } from "@plane/constants";

export const LIST_COLUMNS = [
  { id: "state", name: "Estado", width: 260 },
  { id: "priority", name: "Prioridad", width: 150 },
  { id: "assignee", name: "Responsable", width: 144 },
  { id: "due", name: "Vencimiento", width: 144 },
  { id: "client", name: "Cliente", width: 160 },
  { id: "event", name: "Fecha del evento", width: 160 },
  { id: "sig", name: "Código SIG", width: 160 },
] as const;

type ColumnId = (typeof LIST_COLUMNS)[number]["id"];
type Preferences = Record<ColumnId, { width: number; visible: boolean }>;
const storageKey = (projectId: string) => `izclick-project-list-columns-v4:${projectId}`;
const updateEvent = "izclick-list-columns-updated";
const defaults = (): Preferences =>
  Object.fromEntries(LIST_COLUMNS.map((col) => [col.id, { width: col.width, visible: true }])) as Preferences;

function apply(prefs: Preferences) {
  const root = document.documentElement;
  let propertiesWidth = 0;
  let metadataWidth = 0;
  for (const col of LIST_COLUMNS) {
    const item = prefs[col.id];
    const width = item.visible ? item.width : 0;
    root.style.setProperty(`--izclick-col-${col.id}`, `${width}px`);
    root.style.setProperty(`--izclick-show-${col.id}`, item.visible ? "flex" : "none");
    if (["client", "event", "sig"].includes(col.id)) metadataWidth += width;
    else propertiesWidth += width;
  }
  root.style.setProperty("--izclick-properties-width", `${propertiesWidth}px`);
  root.style.setProperty("--izclick-metadata-width", `${metadataWidth}px`);
  root.style.setProperty("--izclick-row-width", `${420 + propertiesWidth + metadataWidth}px`);
  root.style.setProperty("--izclick-link-width", `${420 + propertiesWidth}px`);
}

export function ListColumnControls() {
  const { projectId } = useParams();
  const scope = String(projectId ?? "default");
  const [prefs, setPrefs] = useState<Preferences>(defaults);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [customFields, setCustomFields] = useState<{ id: string; name: string; type: string }[]>([]);
  const [customError, setCustomError] = useState("");
  const [savingField, setSavingField] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(false);
  const { workspaceSlug } = useParams();
  const customFieldsUrl = `${(API_BASE_URL || "").replace(/\/$/, "")}/api/v1/workspaces/${String(workspaceSlug || "")}/projects/${scope}/izclick-custom-fields/`;
  const loadCustomFields = async () => {
    if (!workspaceSlug || !projectId) return;
    try {
      const res = await fetch(customFieldsUrl, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const values = await res.json();
      if (Array.isArray(values)) { setCustomFields(values); setApiAvailable(true); }
    } catch { setCustomFields([]); setApiAvailable(false); }
  };
  const createCustomField = async () => {
    if (!newFieldName.trim() || savingField) return;
    setSavingField(true);
    setCustomError("");
    try {
      const res = await fetch(customFieldsUrl, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newFieldName.trim(), type: newFieldType, options: [] }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNewFieldName("");
      await loadCustomFields();
    } catch { setCustomError("No se pudo crear el campo. La API y su migración aún deben habilitarse."); }
    finally { setSavingField(false); }
  };

  useEffect(() => { if (open) void loadCustomFields(); }, [open, scope]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => {
    const load = () => {
      try {
      const saved = JSON.parse(localStorage.getItem(storageKey(scope)) || "{}") as Partial<Preferences>;
      const next = defaults();
      for (const col of LIST_COLUMNS) {
        const setting = saved[col.id];
        if (!setting) continue;
        next[col.id] = {
          visible: setting.visible !== false,
          width: Math.max(col.id === "state" ? 220 : col.id === "priority" ? 120 : 96, Math.min(500, Number(setting.width) || col.width)),
        };
      }
      setPrefs(next);
      apply(next);
      } catch {
        apply(defaults());
      }
    };
    load();
    const sync = (event: Event) => {
      if ((event as CustomEvent<string>).detail === scope) load();
    };
    window.addEventListener(updateEvent, sync);
    return () => window.removeEventListener(updateEvent, sync);
  }, [scope]);

  const commit = (next: Preferences) => {
    setPrefs(next);
    apply(next);
    localStorage.setItem(storageKey(scope), JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(updateEvent, { detail: scope }));
  };

  const toggle = (id: ColumnId) => {
    const next = { ...prefs, [id]: { ...prefs[id], visible: !prefs[id].visible } };
    commit(next);
  };

  const resize = (id: ColumnId, startX: number) => {
    const initial = prefs[id].width;
    let updated = prefs;
    let moved = false;
    const move = (event: PointerEvent) => {
      moved = true;
      updated = { ...updated, [id]: { ...updated[id], width: Math.max(id === "state" ? 220 : id === "priority" ? 120 : 96, Math.min(500, initial + event.clientX - startX)) } };
      apply(updated);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      document.body.style.cursor = "";
      if (moved) commit(updated);
    };
    const cancel = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      document.body.style.cursor = "";
      apply(prefs);
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  };

  return (
    <>
      <span className="flex w-[420px] shrink-0 items-center px-3">Carga</span>
      {LIST_COLUMNS.map((col) => (
        <span
          key={col.id}
          className="relative min-w-0 shrink-0 items-center border-l border-subtle px-2"
          style={{
            display: `var(--izclick-show-${col.id}, flex)`,
            width: `var(--izclick-col-${col.id}, ${col.width}px)`,
          }}
        >
          <span className="truncate">{col.name}</span>
          <button
            type="button"
            aria-label={`Cambiar ancho de ${col.name}`}
            title={`Arrastrar para cambiar ancho de ${col.name}`}
            className="absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-accent-primary/30"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              resize(col.id, event.clientX);
            }}
          />
        </span>
      ))}
      <span ref={menuRef} className="relative flex w-11 shrink-0 items-center justify-center border-l border-subtle">
        <button type="button" aria-label="Agregar o quitar columnas" title="Agregar o quitar columnas" className="rounded p-1.5 text-lg hover:bg-layer-1-hover" onClick={() => setOpen((value) => !value)}>+</button>
        {open && <span data-izclick-popover className="absolute right-0 top-full z-[80] w-56 rounded border border-subtle bg-surface-1 p-2 shadow-lg">
          <span className="mb-2 block text-xs font-semibold">Columnas existentes</span>
          {LIST_COLUMNS.map((col) => <label key={col.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-layer-1-hover"><input type="checkbox" checked={prefs[col.id].visible} onChange={() => toggle(col.id)} /><span>{col.name}</span></label>)}
          <span className="mt-3 block border-t border-subtle pt-3">
            <span className="mb-2 block text-xs font-semibold">Crear columna personalizada</span>
            <input aria-label="Nombre de columna" placeholder="Nombre de columna" maxLength={100} value={newFieldName} onChange={e => setNewFieldName(e.target.value)} className="mb-2 w-full rounded border border-subtle bg-surface-1 px-2 py-1.5 text-xs" />
            <select aria-label="Tipo de columna" value={newFieldType} onChange={e => setNewFieldType(e.target.value)} className="mb-2 w-full rounded border border-subtle bg-surface-1 p-1.5 text-xs"><option value="text">Texto</option><option value="number">Número</option><option value="date">Fecha</option><option value="select">Selección</option></select>
            <button type="button" onClick={() => void createCustomField()} disabled={!apiAvailable || savingField || !newFieldName.trim()} className="w-full rounded bg-accent-primary px-2 py-1.5 text-xs text-white disabled:opacity-50">+ Crear campo</button>
            {!apiAvailable && <span className="mb-2 block text-xs text-tertiary">Creación no disponible: primero deben habilitarse la API y la migración.</span>}
            {customError && <span role="alert" className="mt-2 block text-xs text-red-500">{customError}</span>}
            {customFields.length > 0 && <span className="mt-2 block text-xs text-tertiary">{customFields.length} campos personalizados registrados. Visualización de celdas pendiente.</span>}
          </span>
        </span>}
      </span>
    </>
  );
}
