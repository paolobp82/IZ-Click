import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { customFieldsEvent, getCustomFields, getCustomValues, updateCustomValue } from "./izclick-custom-field-api";
import type { IzclickCustomField } from "./izclick-custom-field-api";

export function IzclickCustomFieldCells({ workspaceSlug, projectId, issueId, canEdit }: {
  workspaceSlug: string; projectId: string; issueId: string; canEdit: boolean;
}) {
  const [fields, setFields] = useState<IzclickCustomField[]>([]);
  const [fieldsAvailable, setFieldsAvailable] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [valuesError, setValuesError] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const popupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      getCustomFields(workspaceSlug, projectId)
        .then(async (availableFields) => {
          if (!mounted) return;
          setFields(availableFields);
          setFieldsAvailable(true);
          if (!availableFields.length) {
            setValues({});
            setValuesError(false);
            return;
          }
          try {
            const persistedValues = await getCustomValues(workspaceSlug, projectId, issueId);
            if (mounted && persistedValues && typeof persistedValues === "object" && !Array.isArray(persistedValues)) {
              setValues(persistedValues);
              setValuesError(false);
            }
          } catch {
            if (mounted) setValuesError(true);
          }
        })
        .catch(() => {
          if (mounted) {
            setFields([]);
            setFieldsAvailable(false);
            setValuesError(true);
          }
        });
    };
    refresh();
    const onChange = (e: Event) => { if ((e as CustomEvent<string>).detail === projectId) refresh(); };
    window.addEventListener(customFieldsEvent, onChange);
    return () => { mounted = false; window.removeEventListener(customFieldsEvent, onChange); };
  }, [workspaceSlug, projectId, issueId]);
  useEffect(() => {
    if (!active || !anchor) return;
    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(256, window.innerWidth - 32);
      const left = Math.max(16, Math.min(window.innerWidth - width - 16, rect.left));
      const top = window.innerHeight - rect.bottom >= 230
        ? rect.bottom + 6
        : Math.max(16, rect.top - 210);
      setPopupPosition({ top, left });
    };
    updatePosition();
    const outside = (e: PointerEvent) => {
      const node = e.target as Node;
      if (!popupRef.current?.contains(node) && !anchor.contains(node) && !busy) setActive(null);
    };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) setActive(null); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [active, anchor, busy]);
  const save = async (field: IzclickCustomField) => {
    let value: unknown = draft || null;
    if (draft && field.type === "number") {
      value = Number(draft);
      if (!Number.isFinite(value)) { setError("Número inválido"); return; }
    }
    setBusy(true); setError("");
    try {
      await updateCustomValue(workspaceSlug, projectId, issueId, field.id, value);
      setValues(prev => ({ ...prev, [field.id]: value }));
      setActive(null);
    } catch { setError("No se pudo guardar el valor."); }
    finally { setBusy(false); }
  };
  const activeField = fields.find(field => field.id === active);
  return <>
    {fieldsAvailable && fields.map(field => {
      const current = values[field.id];
      const option = field.options?.find(item => item.id === current);
      const label = field.type === "select" ? (option?.name || "—") : current == null || current === "" ? "—" : String(current);
      return <div key={field.id} data-izclick-custom-cell={field.id} className="relative flex h-11 min-w-0 shrink-0 items-center border-l border-subtle px-2 text-xs" style={{ display: `var(--izclick-custom-display-${field.id}, flex)`, width: `var(--izclick-custom-width-${field.id}, 176px)`, minWidth: `var(--izclick-custom-width-${field.id}, 176px)`, maxWidth: `var(--izclick-custom-width-${field.id}, 176px)` }} onClick={e => e.stopPropagation()}>
        <button disabled={!canEdit || valuesError} type="button" title={valuesError ? "No se pudieron cargar los valores. Actualiza la lista." : label}
          className="flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-layer-1-hover disabled:cursor-default"
          onClick={event => { setAnchor(event.currentTarget); setActive(field.id); setDraft(current == null ? "" : String(current)); setError(""); }}>
          {!valuesError && field.type === "select" && option?.color && <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: option.color }} />}
          <span className="min-w-0 flex-1 truncate">{valuesError ? "Error al cargar" : label}</span>
        </button>
      </div>;
    })}
    {activeField && anchor && createPortal(
      <div
        data-izclick-popover
        ref={popupRef}
        role="dialog"
        aria-label={`Editar ${activeField.name}`}
        className="fixed z-[1000] max-h-[calc(100vh-2rem)] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-subtle bg-surface-1 p-3 text-xs shadow-xl"
        style={{ top: popupPosition.top, left: popupPosition.left }}
      >
        <span className="mb-2 block font-medium">{activeField.name}</span>
        {activeField.type === "select" ? (
          <select aria-label={activeField.name} className="w-full rounded border border-subtle bg-surface-1 p-2" value={draft} onChange={event => setDraft(event.target.value)}>
            <option value="">Sin valor</option>
            {(activeField.options || []).map(option => <option value={option.id} key={option.id}>{option.name}</option>)}
          </select>
        ) : (
          <input
            aria-label={activeField.name}
            className="w-full rounded border border-subtle bg-surface-1 p-2"
            type={activeField.type === "date" ? "date" : activeField.type === "number" ? "number" : "text"}
            value={draft}
            onChange={event => setDraft(event.target.value)}
          />
        )}
        {error && <div role="alert" className="mt-2 text-red-500">{error}</div>}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={() => setActive(null)}>Cancelar</button>
          <button type="button" disabled={busy} className="rounded bg-accent-primary px-2 py-1 text-white" onClick={() => void save(activeField)}>Guardar</button>
        </div>
      </div>,
      document.body
    )}
  </>;
}
