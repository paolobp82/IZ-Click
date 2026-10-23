import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import { API_BASE_URL } from "@plane/constants";
import { getCustomFields, invalidateCustomFields } from "./izclick-custom-field-api";
import { ProductionStateManager } from "./production-state-manager";

import { getListColumnLayout, LIST_COLUMNS } from "@/app/lib/izclick/list-column-layout";
import type { ListColumnId, ListColumnPreferences } from "@/app/lib/izclick/list-column-layout";

export { LIST_COLUMNS } from "@/app/lib/izclick/list-column-layout";

type ColumnId = ListColumnId;
type Preferences = ListColumnPreferences;
const storageKey = (projectId: string) => `izclick-project-list-columns-v4:${projectId}`;
const customWidthStorageKey = (projectId: string) => `izclick-project-custom-column-widths:${projectId}`;
const customWidthVariable = (fieldId: string) => `--izclick-custom-width-${fieldId}`;
const customVisibilityKey = (projectId: string) => `izclick-project-custom-column-visibility:${projectId}`;
const customVisibilityVariable = (fieldId: string) => `--izclick-custom-display-${fieldId}`;
const updateEvent = "izclick-list-columns-updated";
const defaults = (): Preferences =>
  Object.fromEntries(LIST_COLUMNS.map((col) => [col.id, { width: col.width, visible: true }])) as Preferences;

function apply(prefs: Preferences) {
  const root = document.documentElement;
  const layout = getListColumnLayout(prefs);
  for (const column of LIST_COLUMNS) {
    const width = layout.widths[column.id];
    root.style.setProperty(`--izclick-col-${column.id}`, `${width}px`);
    root.style.setProperty(`--izclick-show-${column.id}`, prefs[column.id].visible ? "flex" : "none");
  }
  root.style.setProperty("--izclick-properties-width", `${layout.propertiesWidth}px`);
  root.style.setProperty("--izclick-metadata-width", `${layout.metadataWidth}px`);
  root.style.setProperty("--izclick-row-width", `${layout.rowWidth}px`);
  root.style.setProperty("--izclick-link-width", `${layout.linkWidth}px`);
}

export function ListColumnControls({ canManageStates }: { canManageStates: boolean }) {
  const { projectId } = useParams();
  const scope = String(projectId ?? "default");
  const [prefs, setPrefs] = useState<Preferences>(defaults);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  const menuPanelRef = useRef<HTMLSpanElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [newOptionName, setNewOptionName] = useState("");
  const [newOptionColor, setNewOptionColor] = useState("#3b82f6");
  const [newOptions, setNewOptions] = useState<{ id: string; name: string; color: string }[]>([]);
  const [customFields, setCustomFields] = useState<{ id: string; name: string; type: string }[]>([]);
  const [hiddenCustom, setHiddenCustom] = useState<Record<string, boolean>>({});
  const [customError, setCustomError] = useState("");
  const [savingField, setSavingField] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(false);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const { workspaceSlug } = useParams();
  const customFieldsUrl = `${(API_BASE_URL || "").replace(/\/$/, "")}/api/workspaces/${String(workspaceSlug || "")}/projects/${scope}/izclick-custom-fields/`;
  const loadCustomFields = async () => {
    if (!workspaceSlug || !projectId) return;
    setFieldsLoading(true);
    try {
      const values = await getCustomFields(String(workspaceSlug), scope);
      setCustomFields(values.filter(field => !(field.type === "member" && field.name === "Comercial asignado"))); setApiAvailable(true);
    } catch { setCustomFields([]); setApiAvailable(false); }
    finally { setFieldsLoading(false); }
  };
  const addSelectOption = () => {
    const name = newOptionName.trim();
    if (!name) return;
    if (newOptions.some(option => option.name.toLocaleLowerCase("es") === name.toLocaleLowerCase("es"))) {
      setCustomError("Esa opción ya existe."); return;
    }
    setNewOptions(previous => [...previous, { id: crypto.randomUUID(), name, color: newOptionColor }]);
    setNewOptionName(""); setCustomError("");
  };
  const createCustomField = async () => {
    if (!newFieldName.trim() || savingField || (newFieldType === "select" && newOptions.length === 0)) return;
    setSavingField(true);
    setCustomError("");
    try {
      const res = await fetch(customFieldsUrl, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newFieldName.trim(), type: newFieldType, options: newFieldType === "select" ? newOptions : [] }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNewFieldName("");
      setNewOptions([]);
      invalidateCustomFields(String(workspaceSlug), scope);
    } catch { setCustomError("No se pudo crear la columna. Comprueba tus permisos y vuelve a intentarlo."); }
    finally { setSavingField(false); }
  };

  useEffect(() => {
    void loadCustomFields();
    const listen = (event: Event) => { if ((event as CustomEvent<string>).detail === scope) void loadCustomFields(); };
    window.addEventListener("izclick-custom-fields-updated", listen);
    return () => window.removeEventListener("izclick-custom-fields-updated", listen);
  }, [scope, workspaceSlug]);
  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = menuRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth - 32);
      const menuHeight = Math.min(window.innerHeight * 0.75, 640);
      const availableBelow = window.innerHeight - rect.bottom - 8;
      const top = availableBelow >= Math.min(menuHeight, 260)
        ? rect.bottom + 6
        : Math.max(16, rect.top - menuHeight - 6);
      const left = Math.max(16, Math.min(window.innerWidth - width - 16, rect.right - width));
      setMenuPosition({ top, left });
    };
    updatePosition();
    const outside = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!menuRef.current?.contains(node) && !menuPanelRef.current?.contains(node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
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

  useEffect(() => {
    let stored: Record<string, number> = {};
    try {
      stored = JSON.parse(localStorage.getItem(customWidthStorageKey(scope)) || "{}");
    } catch { stored = {}; }
    for (const field of customFields) {
      const saved = Number(stored[field.id]);
      const width = Number.isFinite(saved) && saved >= 96 && saved <= 500 ? saved : 176;
      document.documentElement.style.setProperty(customWidthVariable(field.id), `${width}px`);
    }
  }, [scope, customFields]);

  useEffect(() => {
    const syncCustomVisibility = () => {
      let hidden: Record<string, boolean> = {};
      try { hidden = JSON.parse(localStorage.getItem(customVisibilityKey(scope)) || "{}"); }
      catch { hidden = {}; }
      setHiddenCustom(hidden);
      for (const field of customFields) {
        document.documentElement.style.setProperty(
          customVisibilityVariable(field.id), hidden[field.id] ? "none" : "flex"
        );
      }
    };
    syncCustomVisibility();
    const onUpdate = (event: Event) => {
      if ((event as CustomEvent<string>).detail === scope) syncCustomVisibility();
    };
    window.addEventListener(updateEvent, onUpdate);
    return () => window.removeEventListener(updateEvent, onUpdate);
  }, [scope, customFields]);

  const toggleCustom = (fieldId: string) => {
    const next = { ...hiddenCustom, [fieldId]: !hiddenCustom[fieldId] };
    localStorage.setItem(customVisibilityKey(scope), JSON.stringify(next));
    setHiddenCustom(next);
    document.documentElement.style.setProperty(
      customVisibilityVariable(fieldId), next[fieldId] ? "none" : "flex"
    );
    window.dispatchEvent(new CustomEvent(updateEvent, { detail: scope }));
  };

  const resizeCustom = (fieldId: string, startX: number) => {
    let stored: Record<string, number> = {};
    try { stored = JSON.parse(localStorage.getItem(customWidthStorageKey(scope)) || "{}"); } catch { stored = {}; }
    const initial = Number(stored[fieldId]) >= 96 ? Number(stored[fieldId]) : 176;
    let updated = initial;
    let moved = false;
    const move = (event: PointerEvent) => {
      moved = true;
      updated = Math.max(96, Math.min(500, initial + event.clientX - startX));
      document.documentElement.style.setProperty(customWidthVariable(fieldId), `${updated}px`);
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      document.body.style.cursor = "";
      if (moved) localStorage.setItem(customWidthStorageKey(scope), JSON.stringify({ ...stored, [fieldId]: updated }));
    };
    const cancel = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      document.body.style.cursor = "";
      document.documentElement.style.setProperty(customWidthVariable(fieldId), `${initial}px`);
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  };

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
      <span className="flex w-[420px] shrink-0 items-center px-3">N.º · Tarea</span>
      {LIST_COLUMNS.map((col) => (
        <span
          key={col.id}
          data-izclick-header={col.id}
          className="relative min-w-0 shrink-0 items-center border-l border-subtle px-2"
          style={{
            display: `var(--izclick-show-${col.id}, flex)`,
            width: `var(--izclick-col-${col.id}, ${col.width}px)`,
          }}
        >
          <span className="min-w-0 flex-1 truncate">{col.name}</span>
          {col.id === "state" && projectId && <ProductionStateManager projectId={String(projectId)} canEdit={canManageStates} />}
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
      {customFields.map(field => <span key={field.id} data-izclick-custom-header={field.id} className="relative flex h-9 min-w-0 shrink-0 items-center border-l border-subtle px-2 text-xs" style={{ width: `var(${customWidthVariable(field.id)}, 176px)`, display: `var(${customVisibilityVariable(field.id)}, flex)` }} title={field.name}>
        <span className="truncate">{field.name}</span>
        <button type="button" aria-label={`Cambiar ancho de ${field.name}`} title={`Arrastrar para cambiar ancho de ${field.name}`}
          className="absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-accent-primary/30"
          onPointerDown={event => { event.preventDefault(); event.stopPropagation(); resizeCustom(field.id, event.clientX); }} />
      </span>)}
      <span ref={menuRef} className="relative flex w-11 shrink-0 items-center justify-center border-l border-subtle">
        <button type="button" aria-label="Agregar o quitar columnas" title="Agregar o quitar columnas" className="rounded p-1.5 text-lg hover:bg-layer-1-hover" onClick={() => setOpen((value) => !value)}>+</button>
        {open && createPortal(<span ref={menuPanelRef} data-izclick-popover className="fixed z-[1000] max-h-[min(75vh,640px)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-subtle bg-surface-1 p-3 shadow-xl" style={{ top: menuPosition.top, left: menuPosition.left }}>
          <span className="mb-2 block text-xs font-semibold">Columnas existentes</span>
          {LIST_COLUMNS.map((col) => <label key={col.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-layer-1-hover"><input type="checkbox" checked={prefs[col.id].visible} onChange={() => toggle(col.id)} /><span>{col.name}</span></label>)}
          {customFields.length > 0 && <span className="mt-3 block border-t border-subtle pt-3">
            <span className="mb-2 block text-xs font-semibold">Columnas personalizadas</span>
            {customFields.map(field => <label key={field.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-layer-1-hover">
              <input type="checkbox" checked={!hiddenCustom[field.id]} onChange={() => toggleCustom(field.id)} />
              <span className="min-w-0 flex-1 truncate" title={field.name}>{field.name}</span>
              <span className="text-[10px] text-tertiary">{{ text: "Texto", number: "Número", date: "Fecha", select: "Selección", member: "Asignación" }[field.type] ?? field.type}</span>
            </label>)}
          </span>}
          <span className="mt-3 block border-t border-subtle pt-3">
            <span className="mb-2 block text-xs font-semibold">Crear columna personalizada</span>
            <input aria-label="Nombre de columna" placeholder="Nombre de columna" maxLength={100} value={newFieldName} onChange={e => setNewFieldName(e.target.value)} className="mb-2 w-full rounded border border-subtle bg-surface-1 px-2 py-1.5 text-xs" />
            <select aria-label="Tipo de columna" value={newFieldType} onChange={e => setNewFieldType(e.target.value)} className="mb-2 w-full rounded border border-subtle bg-surface-1 p-1.5 text-xs"><option value="text">Texto</option><option value="number">Número</option><option value="date">Fecha</option><option value="select">Selección</option><option value="member">Asignación a miembro</option></select>
            {newFieldType === "select" && <span className="mb-2 block space-y-2 rounded border border-subtle p-2">
              <span className="block text-xs font-medium">Opciones y colores</span>
              {newOptions.map(option => <span key={option.id} className="flex items-center gap-2 text-xs"><span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: option.color }} /><span className="min-w-0 flex-1 truncate">{option.name}</span><button type="button" aria-label={`Eliminar ${option.name}`} onClick={() => setNewOptions(previous => previous.filter(x => x.id !== option.id))}>✕</button></span>)}
              <span className="flex items-center gap-1"><input value={newOptionName} onChange={e => setNewOptionName(e.target.value)} placeholder="Nueva opción" maxLength={60} className="min-w-0 flex-1 rounded border border-subtle bg-surface-1 px-1 py-1 text-xs" /><input aria-label="Color de opción" type="color" value={newOptionColor} onChange={e => setNewOptionColor(e.target.value)} className="size-6 shrink-0" /><button type="button" disabled={!newOptionName.trim()} onClick={addSelectOption} className="rounded border border-subtle px-2 py-1 text-xs">Añadir</button></span>
            </span>}
            <button type="button" onClick={() => void createCustomField()} disabled={fieldsLoading || !apiAvailable || savingField || !newFieldName.trim() || (newFieldType === "select" && newOptions.length === 0)} className="w-full rounded bg-accent-primary px-2 py-1.5 text-xs text-white disabled:opacity-50">+ Crear campo</button>
            {fieldsLoading && <span className="mb-2 block text-xs text-tertiary">Consultando campos del proyecto…</span>}
            {!fieldsLoading && !apiAvailable && <span className="mb-2 block text-xs text-tertiary">No se pudieron cargar las columnas. Revisa la conexión o tus permisos.</span>}
            {customError && <span role="alert" className="mt-2 block text-xs text-red-500">{customError}</span>}
            {customFields.length > 0 && <span className="mt-2 block text-xs text-tertiary">{customFields.length} columna(s) personalizada(s) disponible(s) en este proyecto.</span>}
          </span>
        </span>, document.body)}
      </span>
    </>
  );
}
